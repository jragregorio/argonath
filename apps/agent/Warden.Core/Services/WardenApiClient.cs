using System.Net.Http.Json;
using System.Text.Json;
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

    public WardenApiClient(HttpClient http, ConfigStore configStore)
    {
        _http = http;
        _configStore = configStore;
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

    public async Task<PairingResponse?> PairAsync(string code)
    {
        var config = _configStore.Load();
        var request = new
        {
            action = "pair",
            code,
            machineName = Environment.MachineName,
            agentVersion = "1.0.0"
        };

        var response = await _http.PostAsJsonAsync($"{config.ApiBaseUrl}/api/agent", request);
        if (!response.IsSuccessStatusCode) return null;

        var result = await response.Content.ReadFromJsonAsync<PairingResponse>(JsonOptions);
        if (result != null)
        {
            config.DeviceToken = result.DeviceToken;
            config.DeviceId = result.DeviceId;
            config.ChildName = result.ChildName;
            _configStore.Save(config);
        }

        return result;
    }

    public async Task<bool> SendHeartbeatAsync(int activeMinutes, int idleMinutes, bool isLocked)
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var request = new HeartbeatRequest
        {
            ActiveMinutesToday = activeMinutes,
            IdleMinutesToday = idleMinutes,
            IsLocked = isLocked,
            MachineName = Environment.MachineName,
            AgentVersion = "1.0.0"
        };

        var response = await _http.PostAsJsonAsync(
            $"{config.ApiBaseUrl}/api/agent",
            request
        );

        HandleUnpairedResponse(response);
        return response.IsSuccessStatusCode;
    }

    public async Task<PolicyData?> GetPolicyAsync()
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var response = await _http.GetAsync(
            $"{config.ApiBaseUrl}/api/agent?action=policy"
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

    public async Task<bool> ConfirmSnapshotAsync(string snapshotId, bool success, string? error = null)
    {
        SetDeviceTokenHeader();
        var config = _configStore.Load();

        var response = await _http.PostAsJsonAsync(
            $"{config.ApiBaseUrl}/api/agent",
            new { action = "confirmSnapshot", snapshotId, success, errorMessage = error }
        );

        HandleUnpairedResponse(response);
        return response.IsSuccessStatusCode;
    }
}
