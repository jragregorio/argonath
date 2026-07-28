using System.Text.Json;
using Warden.Core.Models;
using Websocket.Client;

namespace Warden.Core.Services;

public class RealtimeService : IDisposable
{
    private WebsocketClient? _client;
    private readonly ConfigStore _configStore;
    private readonly Action<RealtimeEvent> _onEvent;

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

        var wsUrl = config.SupabaseUrl
            .Replace("https://", "wss://")
            .Replace("http://", "ws://");

        var uri = new Uri(
            $"{wsUrl}/realtime/v1/websocket?apikey={config.SupabaseAnonKey}&vsn=1.0.0"
        );

        _client?.Dispose();
        _client = new WebsocketClient(uri)
        {
            ReconnectTimeout = TimeSpan.FromSeconds(30)
        };

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

        var channelJoin = JsonSerializer.Serialize(new
        {
            topic = $"realtime:device:{config.DeviceId}",
            @event = "phx_join",
            payload = new { config = new { broadcast = new { self = false } } },
            @ref = "1"
        });

        _client.Send(channelJoin);
    }

    public void Dispose()
    {
        _client?.Dispose();
    }
}
