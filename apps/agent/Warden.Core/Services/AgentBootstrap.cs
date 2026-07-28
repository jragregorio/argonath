using System.Reflection;
using System.Text.Json;
using Warden.Core.Models;

namespace Warden.Core.Services;

internal sealed class BootstrapFile
{
    public string? ApiBaseUrl { get; set; }
}

public static class AgentBootstrap
{
    private const string DefaultDevUrl = "http://localhost:3000";
    private const string BootstrapFileName = "warden.json";

    public static string ResolveApiBaseUrl(AgentConfig config)
    {
        if (
            !string.IsNullOrWhiteSpace(config.DeviceToken)
            && !string.IsNullOrWhiteSpace(config.ApiBaseUrl)
        )
        {
            return config.ApiBaseUrl.Trim().TrimEnd('/');
        }

        var fromFile = TryLoadBootstrapFile()?.ApiBaseUrl;
        if (!string.IsNullOrWhiteSpace(fromFile))
        {
            return fromFile.Trim().TrimEnd('/');
        }

        var fromEnv = Environment.GetEnvironmentVariable("WARDEN_API_BASE_URL");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv.Trim().TrimEnd('/');
        }

        if (
            !string.IsNullOrWhiteSpace(config.ApiBaseUrl)
            && !IsLocalhost(config.ApiBaseUrl)
        )
        {
            return config.ApiBaseUrl.Trim().TrimEnd('/');
        }

#if DEBUG
        return DefaultDevUrl;
#else
        return DefaultDevUrl;
#endif
    }

    public static string GetPairingHelpText(string apiBaseUrl)
    {
        if (!IsLocalhost(apiBaseUrl))
        {
            return $"Could not reach the Warden server at {apiBaseUrl}. Check your internet connection and try again.";
        }

        return
            "Could not reach the Warden server at localhost:3000. "
            + "For production pairing, place a warden.json file next to Warden.Tray.exe with your dashboard URL, "
            + "for example: { \"apiBaseUrl\": \"https://your-app.vercel.app\" }. "
            + "Or set the WARDEN_API_BASE_URL environment variable.";
    }

    private static BootstrapFile? TryLoadBootstrapFile()
    {
        foreach (var path in GetBootstrapSearchPaths())
        {
            if (!File.Exists(path))
            {
                continue;
            }

            try
            {
                var json = File.ReadAllText(path);
                return JsonSerializer.Deserialize<BootstrapFile>(
                    json,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                );
            }
            catch
            {
                // Ignore malformed bootstrap files and keep searching.
            }
        }

        return null;
    }

    private static IEnumerable<string> GetBootstrapSearchPaths()
    {
        var baseDir = AppContext.BaseDirectory;
        if (!string.IsNullOrWhiteSpace(baseDir))
        {
            yield return Path.Combine(baseDir, BootstrapFileName);
        }

        var processPath = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(processPath))
        {
            var processDir = Path.GetDirectoryName(processPath);
            if (!string.IsNullOrWhiteSpace(processDir))
            {
                yield return Path.Combine(processDir, BootstrapFileName);
            }
        }

        var assemblyDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        if (!string.IsNullOrWhiteSpace(assemblyDir))
        {
            yield return Path.Combine(assemblyDir, BootstrapFileName);
        }
    }

    private static bool IsLocalhost(string url) =>
        url.Contains("localhost", StringComparison.OrdinalIgnoreCase)
        || url.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase);
}
