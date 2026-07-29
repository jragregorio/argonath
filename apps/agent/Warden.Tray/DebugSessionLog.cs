using System.IO;
using System.Text.Json;

namespace Warden.Tray;

/// <summary>Session debug NDJSON logger (agent debug mode).</summary>
internal static class DebugSessionLog
{
    private const string Path = @"c:\DEV\Guardian\debug-8f2974.log";
    private static readonly object Gate = new();

    public static void Write(string hypothesisId, string location, string message, object? data = null)
    {
        try
        {
            var payload = new Dictionary<string, object?>
            {
                ["sessionId"] = "8f2974",
                ["hypothesisId"] = hypothesisId,
                ["location"] = location,
                ["message"] = message,
                ["data"] = data,
                ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            var line = JsonSerializer.Serialize(payload);
            lock (Gate)
            {
                File.AppendAllText(Path, line + Environment.NewLine);
            }
        }
        catch
        {
            // Never break tray for debug logging.
        }
    }
}
