using System.Net.Http.Json;
using System.Text.Json;
using Warden.Core.Diagnostics;
using Warden.Core.Models;

namespace Warden.Core.Services;

public sealed class DeviceUnpairedException : Exception
{
    public DeviceUnpairedException()
        : base("This device is no longer paired. Please reopen Warden and pair it again.")
    {
    }
}

public class WardenApiClient
{
    private readonly HttpClient _http;
    private readonly ConfigStore _configStore;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private const int MaxTransientAttempts = 3;

    public WardenApiClient(HttpClient http, ConfigStore configStore)
    {
        _http = http;
        _configStore = configStore;
    }

    private static string? NormalizeUrl(string? value)
    {
        var trimmed = value?.Trim().TrimEnd('/');
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private bool HandleUnpairedResponse(HttpResponseMessage response)
    {
        if (
            response.StatusCode != System.Net.HttpStatusCode.Unauthorized
            && response.StatusCode != System.Net.HttpStatusCode.NotFound
        )
        {
            return false;
        }

        _configStore.Clear();
        throw new DeviceUnpairedException();
    }

    private void SetDeviceTokenHeader()
    {
        var config = _configStore.Load();
        _http.DefaultRequestHeaders.Remove("x-device-token");
        if (!string.IsNullOrEmpty(config.DeviceToken))
        {
            _http.DefaultRequestHeaders.Add("x-device-token", config.DeviceToken);
        }
    }

    private async Task<HttpResponseMessage> SendWithTransientRetryAsync(
        Func<CancellationToken, Task<HttpResponseMessage>> send,
        string operation,
        CancellationToken cancellationToken = default
    )
    {
        Exception? last = null;
        for (var attempt = 1; attempt <= MaxTransientAttempts; attempt++)
        {
            try
            {
                return await send(cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (NetworkResilience.IsRecoverable(ex) && attempt < MaxTransientAttempts)
            {
                last = ex;
                // Jittered exponential backoff: ~200ms, ~800ms (+0-100ms).
                var delayMs = (200 * attempt * attempt) + Random.Shared.Next(0, 100);
                WardenLog.Warn(
                    "Api",
                    $"{operation} attempt {attempt}/{MaxTransientAttempts} failed; retry in {delayMs}ms",
                    ex
                );
                await Task.Delay(delayMs, cancellationToken).ConfigureAwait(false);
            }
        }

        throw last ?? new HttpRequestException($"{operation} failed after retries");
    }

    public async Task<PairingResponse?> PairAsync(string code)
    {
        var config = _configStore.Load();
        var request = new
        {
            action = "pair",
            code,
            machineName = Environment.MachineName,
            agentVersion = AgentVersionInfo.Current
        };

        var response = await _http.PostAsJsonAsync($"{config.ApiBaseUrl}/api/agent", request);
        if (!response.IsSuccessStatusCode) return null;

        var result = await response.Content.ReadFromJsonAsync<PairingResponse>(JsonOptions);
        if (result != null)
        {
            config.DeviceToken = result.DeviceToken;
            config.DeviceId = result.DeviceId;
            config.ChildName = result.ChildName;
            config.ApiBaseUrl = NormalizeUrl(result.ApiBaseUrl) ?? config.ApiBaseUrl;
            config.SupabaseUrl = NormalizeUrl(result.SupabaseUrl);
            config.SupabaseAnonKey = string.IsNullOrWhiteSpace(result.SupabaseAnonKey)
                ? null
                : result.SupabaseAnonKey.Trim();
            _configStore.Save(config);
        }

        return result;
    }

    public async Task<bool> SendHeartbeatAsync(
        int activeMinutes,
        int idleMinutes,
        bool isLocked,
        bool previousSessionUnclean = false
    )
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var request = new HeartbeatRequest
        {
            ActiveMinutesToday = activeMinutes,
            IdleMinutesToday = idleMinutes,
            IsLocked = isLocked,
            MachineName = Environment.MachineName,
            AgentVersion = AgentVersionInfo.Current,
            PreviousSessionUnclean = previousSessionUnclean
        };

        var response = await SendWithTransientRetryAsync(
            ct => _http.PostAsJsonAsync($"{config.ApiBaseUrl}/api/agent", request, ct),
            "heartbeat"
        );

        HandleUnpairedResponse(response);
        return response.IsSuccessStatusCode;
    }

    public async Task<PolicyData?> GetPolicyAsync()
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var response = await SendWithTransientRetryAsync(
            ct => _http.GetAsync($"{config.ApiBaseUrl}/api/agent?action=policy", ct),
            "getPolicy"
        );

        HandleUnpairedResponse(response);
        if (!response.IsSuccessStatusCode) return null;
        return await response.Content.ReadFromJsonAsync<PolicyData>(JsonOptions);
    }

    public async Task<bool> RequestExtensionAsync(int minutes)
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var response = await _http.PostAsJsonAsync(
            $"{config.ApiBaseUrl}/api/agent",
            new { action = "requestExtension", requestedMinutes = minutes }
        );

        HandleUnpairedResponse(response);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> ParentUnlockAsync(int extraMinutes)
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var response = await _http.PostAsJsonAsync(
            $"{config.ApiBaseUrl}/api/agent",
            new { action = "parentUnlock", extraMinutes }
        );

        HandleUnpairedResponse(response);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> SetLockedAsync(bool isLocked)
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var response = await _http.PostAsJsonAsync(
            $"{config.ApiBaseUrl}/api/agent",
            new { action = "setLocked", isLocked }
        );

        HandleUnpairedResponse(response);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> ClearAdminLockAsync()
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var response = await _http.PostAsJsonAsync(
            $"{config.ApiBaseUrl}/api/agent",
            new { action = "clearAdminLock" }
        );

        HandleUnpairedResponse(response);
        return response.IsSuccessStatusCode;
    }

    public async Task ConfirmSnapshotAsync(string snapshotId, bool success, string? error = null)
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        object request = string.IsNullOrEmpty(error)
            ? new { action = "confirmSnapshot", snapshotId, success }
            : new { action = "confirmSnapshot", snapshotId, success, errorMessage = error };

        var response = await _http.PostAsJsonAsync(
            $"{config.ApiBaseUrl}/api/agent",
            request
        );

        var body = await response.Content.ReadAsStringAsync();
        HandleUnpairedResponse(response);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"confirmSnapshot failed ({(int)response.StatusCode}): {body}"
            );
        }
    }

    public async Task<List<PendingCapture>> GetPendingCapturesAsync()
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var response = await SendWithTransientRetryAsync(
            ct => _http.GetAsync($"{config.ApiBaseUrl}/api/agent?action=pendingCaptures", ct),
            "pendingCaptures"
        );

        HandleUnpairedResponse(response);
        if (!response.IsSuccessStatusCode)
        {
            return [];
        }

        return await response.Content.ReadFromJsonAsync<List<PendingCapture>>(JsonOptions)
            ?? [];
    }

    public async Task<List<PendingNudge>> GetPendingNudgesAsync()
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var response = await SendWithTransientRetryAsync(
            ct => _http.GetAsync($"{config.ApiBaseUrl}/api/agent?action=pendingNudges", ct),
            "pendingNudges"
        );

        HandleUnpairedResponse(response);
        if (!response.IsSuccessStatusCode)
        {
            return [];
        }

        return await response.Content.ReadFromJsonAsync<List<PendingNudge>>(JsonOptions)
            ?? [];
    }

    public async Task AckNudgeAsync(string nudgeId, string status, string? responseLabel = null)
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        object request = string.IsNullOrEmpty(responseLabel)
            ? new { action = "ackNudge", nudgeId, status }
            : new { action = "ackNudge", nudgeId, status, response = responseLabel };

        var response = await _http.PostAsJsonAsync(
            $"{config.ApiBaseUrl}/api/agent",
            request
        );

        var body = await response.Content.ReadAsStringAsync();
        HandleUnpairedResponse(response);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"ackNudge failed ({(int)response.StatusCode}): {body}"
            );
        }
    }
}
