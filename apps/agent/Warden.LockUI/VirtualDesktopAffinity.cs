using System.Runtime.InteropServices;

namespace Warden.LockUI;

internal static class VirtualDesktopAffinity
{
    private static readonly object Gate = new();
    private static IVirtualDesktopManager? _manager;
    private static bool _resolveAttempted;
    private static bool _available;

    public static bool IsAvailable
    {
        get
        {
            Resolve();
            return _available;
        }
    }

    public static bool IsOnCurrentDesktop(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero)
        {
            return false;
        }

        var manager = Resolve();
        if (manager == null)
        {
            return true;
        }

        try
        {
            var hr = manager.IsWindowOnCurrentVirtualDesktop(hwnd, out var onCurrent);
            if (hr != 0)
            {
                return true;
            }

            return onCurrent;
        }
        catch (COMException)
        {
            return true;
        }
            catch (InvalidCastException)
            {
                return true;
            }
            catch (Exception)
            {
                return true;
            }
        }

    private static IVirtualDesktopManager? Resolve()
    {
        lock (Gate)
        {
            if (_resolveAttempted)
            {
                return _manager;
            }

            _resolveAttempted = true;
            try
            {
                _manager = (IVirtualDesktopManager)new VirtualDesktopManagerClass();
                _available = _manager != null;
            }
            catch (COMException)
            {
                _manager = null;
                _available = false;
            }
            catch (InvalidCastException)
            {
                _manager = null;
                _available = false;
            }
            catch (Exception)
            {
                _manager = null;
                _available = false;
            }

            return _manager;
        }
    }

    [ComImport]
    [Guid("a5cd92ff-29be-454c-8d04-d82879fb3f1b")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IVirtualDesktopManager
    {
        [PreserveSig]
        int IsWindowOnCurrentVirtualDesktop(
            IntPtr topLevelWindow,
            [MarshalAs(UnmanagedType.Bool)] out bool onCurrentDesktopOut);

        void GetWindowDesktopId(IntPtr topLevelWindow, out Guid desktopId);

        [PreserveSig]
        int MoveWindowToDesktop(IntPtr topLevelWindow, ref Guid desktopId);
    }

    [ComImport]
    [Guid("aa509086-5ca9-4c25-8f95-589d3c07b48a")]
    private class VirtualDesktopManagerClass;
}
