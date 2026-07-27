using System.Runtime.InteropServices;

namespace Argonath.Core.Services;

public class IdleTimeDetector
{
    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    public const int IdleThresholdSeconds = 300;

    public static uint GetIdleTimeSeconds()
    {
        var lastInput = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        if (!GetLastInputInfo(ref lastInput)) return 0;

        var idleTicks = (uint)Environment.TickCount - lastInput.dwTime;
        return idleTicks / 1000;
    }

    public static bool IsUserActive()
    {
        return GetIdleTimeSeconds() < IdleThresholdSeconds;
    }
}
