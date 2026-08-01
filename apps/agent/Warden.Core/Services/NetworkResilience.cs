using System.Net.Http;
using System.Net.Sockets;
using System.Net.WebSockets;
using Warden.Core.Diagnostics;

namespace Warden.Core.Services;

/// <summary>
/// Shared helpers for treating transient network failures as non-fatal in the agent.
/// </summary>
public static class NetworkResilience
{
    /// <summary>
    /// True when <paramref name="ex"/> (or any inner exception) is a transient transport
    /// failure that should not tear down the enforcement agent.
    /// </summary>
    public static bool IsRecoverable(Exception? ex)
    {
        for (var cur = ex; cur != null; cur = cur.InnerException)
        {
            switch (cur)
            {
                case DeviceUnpairedException:
                    return false;
                case HttpRequestException:
                case IOException:
                case SocketException:
                case TaskCanceledException: // includes HttpClient timeouts
                case TimeoutException:
                case WebSocketException:
                    return true;
            }
        }

        return false;
    }

    public static HttpClient CreateAgentHttpClient()
    {
        var handler = new SocketsHttpHandler
        {
            // Avoid stale pooled sockets (classic cause of SocketException 10054) and
            // pick up DNS changes after sleep / network switch.
            PooledConnectionLifetime = TimeSpan.FromMinutes(2),
            ConnectTimeout = TimeSpan.FromSeconds(10),
        };

        return new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(30),
        };
    }
}

/// <summary>Tracks consecutive heartbeat failures for recovery logging.</summary>
public sealed class HeartbeatHealthTracker
{
    private int _consecutiveFailures;
    private DateTime? _outageStartedUtc;

    public int ConsecutiveFailures => _consecutiveFailures;

    public void RecordSuccess()
    {
        if (_consecutiveFailures <= 0)
        {
            return;
        }

        var failures = _consecutiveFailures;
        var started = _outageStartedUtc ?? DateTime.UtcNow;
        var duration = DateTime.UtcNow - started;
        _consecutiveFailures = 0;
        _outageStartedUtc = null;
        WardenLog.Info(
            "Heartbeat",
            $"recovered after {failures} consecutive failure(s); outage={duration.TotalSeconds:F1}s"
        );
    }

    public void RecordFailure(Exception ex)
    {
        if (_consecutiveFailures == 0)
        {
            _outageStartedUtc = DateTime.UtcNow;
        }

        _consecutiveFailures++;
        WardenLog.Warn(
            "Heartbeat",
            $"failed (consecutive={_consecutiveFailures})",
            ex
        );
    }
}
