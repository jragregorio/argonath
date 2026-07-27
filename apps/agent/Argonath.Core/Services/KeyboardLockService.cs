using System.Runtime.InteropServices;

namespace Argonath.Core.Services;

public interface IKeyboardLock
{
    bool IsEnabled { get; }
    void Enable();
    void Disable();
}

/// <summary>
/// Best-effort suppression of task-switch / Start shortcuts while the lock UI is up.
/// Does not block Ctrl+Alt+Del or reliably block Win+L (Windows Secure Attention Sequence limits).
/// </summary>
public sealed class KeyboardLockService : IKeyboardLock
{
    private const int WhKeyboardLl = 13;
    private const int HcAction = 0;
    private const int WmKeyDown = 0x0100;
    private const int WmSysKeyDown = 0x0104;

    private const int VkTab = 0x09;
    private const int VkEscape = 0x1B;
    private const int VkLwin = 0x5B;
    private const int VkRwin = 0x5C;
    private const int VkF4 = 0x73;
    private const int VkControl = 0x11;
    private const int VkMenu = 0x12; // Alt
    private const int LlkHfAltDown = 0x20;

    private static readonly LowLevelKeyboardProc HookProc = HookCallback;
    private static IntPtr _hookId = IntPtr.Zero;
    private static readonly object Gate = new();

    public bool IsEnabled
    {
        get
        {
            lock (Gate)
            {
                return _hookId != IntPtr.Zero;
            }
        }
    }

    public void Enable()
    {
        lock (Gate)
        {
            if (_hookId != IntPtr.Zero) return;

            // user32 handle is the reliable module for WH_KEYBOARD_LL in .NET.
            var module = LoadLibrary("user32.dll");
            _hookId = SetWindowsHookEx(WhKeyboardLl, HookProc, module, 0);

            if (_hookId == IntPtr.Zero)
            {
                throw new InvalidOperationException(
                    $"SetWindowsHookEx failed (error {Marshal.GetLastWin32Error()})."
                );
            }
        }
    }

    public void Disable()
    {
        lock (Gate)
        {
            if (_hookId == IntPtr.Zero) return;

            UnhookWindowsHookEx(_hookId);
            _hookId = IntPtr.Zero;
        }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode == HcAction)
        {
            var info = Marshal.PtrToStructure<KbdLlHookStruct>(lParam);
            var message = wParam.ToInt32();

            if (ShouldBlock(info, message))
            {
                return (IntPtr)1;
            }
        }

        return CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
    }

    private static bool ShouldBlock(KbdLlHookStruct info, int message)
    {
        var vk = info.VkCode;

        // Swallow Win keys entirely (covers Win+Tab and most Win+ chords).
        if (vk is VkLwin or VkRwin)
        {
            return true;
        }

        var isKeyDown = message is WmKeyDown or WmSysKeyDown;
        if (!isKeyDown)
        {
            return false;
        }

        var altDown =
            (info.Flags & LlkHfAltDown) != 0
            || (GetAsyncKeyState(VkMenu) & 0x8000) != 0;
        var ctrlDown = (GetAsyncKeyState(VkControl) & 0x8000) != 0;

        // Alt+Tab, Alt+Esc, Alt+F4
        if (altDown && vk is VkTab or VkEscape or VkF4)
        {
            return true;
        }

        // Ctrl+Esc (Start), Ctrl+Shift+Esc (Task Manager)
        if (ctrlDown && vk == VkEscape)
        {
            return true;
        }

        return false;
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KbdLlHookStruct
    {
        public int VkCode;
        public int ScanCode;
        public int Flags;
        public int Time;
        public IntPtr DwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(
        int idHook,
        LowLevelKeyboardProc lpfn,
        IntPtr hMod,
        uint dwThreadId
    );

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibrary(string lpFileName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);
}
