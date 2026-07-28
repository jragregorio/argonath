using System.Text.Json;

namespace Warden.Core.Services;

internal static class DebugSessionLog
{
    private const string LogPath = @"c:\DEV\Guardian\debug-8f2974.log";

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
                ["runId"] = "pre-fix"
            };
            File.AppendAllText(
                LogPath,
                JsonSerializer.Serialize(payload) + Environment.NewLine
            );
        }
        catch
        {
            // Never break capture for debug logging.
        }
    }
}
