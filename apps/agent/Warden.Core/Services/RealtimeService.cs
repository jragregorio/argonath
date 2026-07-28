using System.Text.Json;
using System.Timers;
using Warden.Core.Models;
using Websocket.Client;
using Timer = System.Timers.Timer;

namespace Warden.Core.Services;

public class RealtimeService : IDisposable
{
    private WebsocketClient? _client;
    private readonly ConfigStore _configStore;
    private readonly Action<RealtimeEvent> _onEvent;
    private Timer? _heartbeatTimer;
    private string? _deviceId;
    private int _joinRef;

    public RealtimeService(ConfigStore configStore, Action<RealtimeEvent> onEvent)
    {
        _configStore = configStore;
        _onEvent = onEvent;
    }

    public async Task ConnectAsync()
    {
        var config = _configStore.Load();
        if (string.IsNullOrEmpty(config.DeviceId) || string.IsNullOrEmpty(config.SupabaseUrl))
            return;

        _deviceId = config.DeviceId;

        var wsUrl = config.SupabaseUrl
            .Replace("https://", "wss://")
            .Replace("http://", "ws://");

        var uri = new Uri(
            $"{wsUrl}/realtime/v1/websocket?apikey={config.SupabaseAnonKey}&vsn=1.0.0"
        );

        _heartbeatTimer?.Stop();
        _heartbeatTimer?.Dispose();
        _client?.Dispose();
        _client = new WebsocketClient(uri)
        {
            ReconnectTimeout = TimeSpan.FromSeconds(30)
        };

        _client.ReconnectionHappened.Subscribe(_ =>
        {
            try
            {
                JoinDeviceChannel();
            }
            catch
            {
                // Next reconnect attempt will retry.
            }
        });

        _client.MessageReceived.Subscribe(msg =>
        {
            try
            {
                if (msg.Text == null) return;
                var doc = JsonDocument.Parse(msg.Text);
                var root = doc.RootElement;

                if (root.TryGetProperty("event", out var evt) && evt.GetString() == "phx_reply")
                    return;

                if (root.TryGetProperty("payload", out var payload) &&
                    payload.TryGetProperty("event", out var eventName) &&
                    eventName.GetString() == "warden" &&
                    payload.TryGetProperty("payload", out var eventPayload))
                {
                    var realtimeEvent = JsonSerializer.Deserialize<RealtimeEvent>(
                        eventPayload.GetRawText(),
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                    );
                    if (realtimeEvent != null)
                        _onEvent(realtimeEvent);
                }
            }
            catch
            {
                // Ignore malformed messages
            }
        });

        await _client.StartOrFail();
        JoinDeviceChannel();

        _heartbeatTimer = new Timer(20_000) { AutoReset = true };
        _heartbeatTimer.Elapsed += (_, _) =>
        {
            try
            {
                SendPhoenixHeartbeat();
            }
            catch
            {
                // Socket may be reconnecting.
            }
        };
        _heartbeatTimer.Start();
    }

    private void JoinDeviceChannel()
    {
        if (_client == null || string.IsNullOrEmpty(_deviceId))
            return;

        _joinRef++;
        var channelJoin = JsonSerializer.Serialize(new
        {
            topic = $"realtime:device:{_deviceId}",
            @event = "phx_join",
            payload = new { config = new { broadcast = new { self = false } } },
            @ref = _joinRef.ToString()
        });

        _client.Send(channelJoin);
    }

    private void SendPhoenixHeartbeat()
    {
        if (_client == null || !_client.IsRunning)
            return;

        var heartbeat = JsonSerializer.Serialize(new
        {
            topic = "phoenix",
            @event = "heartbeat",
            payload = new { },
            @ref = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString()
        });

        _client.Send(heartbeat);
    }

    public void Dispose()
    {
        _heartbeatTimer?.Stop();
        _heartbeatTimer?.Dispose();
        _heartbeatTimer = null;
        _client?.Dispose();
    }
}
