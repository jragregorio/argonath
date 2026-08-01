using System.Text.Json;
using Warden.Core.Models;

namespace Warden.Core.Services;

public class ConfigStore
{
    private readonly string _configPath;
    private bool _recoveredFromCorruptConfig;

    public ConfigStore()
        : this(null)
    {
    }

    /// <param name="configDirectory">
    /// Optional override for the config folder (tests/harnesses). Null uses
    /// %LOCALAPPDATA%\Warden and migrates legacy brand folders.
    /// </param>
    public ConfigStore(string? configDirectory)
    {
        if (!string.IsNullOrWhiteSpace(configDirectory))
        {
            Directory.CreateDirectory(configDirectory);
            _configPath = Path.Combine(configDirectory, "config.json");
            return;
        }

        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var dir = Path.Combine(appData, "Warden");
        Directory.CreateDirectory(dir);
        _configPath = Path.Combine(dir, "config.json");

        // Migrate from previous brand folders if present.
        foreach (var legacyBrand in new[] { "Argonath", "Guardian" })
        {
            var legacyPath = Path.Combine(appData, legacyBrand, "config.json");
            if (!File.Exists(_configPath) && File.Exists(legacyPath))
            {
                File.Copy(legacyPath, _configPath);
                break;
            }
        }
    }

    /// <summary>
    /// True after a corrupt/empty config.json was discarded. Cleared when consumed.
    /// </summary>
    public bool ConsumeCorruptConfigRecovery()
    {
        if (!_recoveredFromCorruptConfig)
        {
            return false;
        }

        _recoveredFromCorruptConfig = false;
        return true;
    }

    public AgentConfig Load()
    {
        AgentConfig config;

        if (!File.Exists(_configPath))
        {
            config = new AgentConfig();
        }
        else
        {
            try
            {
                var json = File.ReadAllText(_configPath);
                if (string.IsNullOrWhiteSpace(json))
                {
                    DiscardCorruptConfig();
                    config = new AgentConfig();
                }
                else
                {
                    config = JsonSerializer.Deserialize<AgentConfig>(json) ?? new AgentConfig();
                }
            }
            catch (Exception)
            {
                // Empty, truncated, or unreadable config must not crash the tray app.
                DiscardCorruptConfig();
                config = new AgentConfig();
            }
        }

        config.ApiBaseUrl = AgentBootstrap.ResolveApiBaseUrl(config);
        return config;
    }

    public void Save(AgentConfig config)
    {
        var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_configPath, json);
    }

    public bool IsPaired()
    {
        var config = Load();
        return !string.IsNullOrEmpty(config.DeviceToken);
    }

    public void Clear()
    {
        if (File.Exists(_configPath))
            File.Delete(_configPath);
    }

    private void DiscardCorruptConfig()
    {
        _recoveredFromCorruptConfig = true;
        try
        {
            if (File.Exists(_configPath))
            {
                File.Delete(_configPath);
            }
        }
        catch
        {
            // Best-effort cleanup; Load already falls back to unpaired defaults.
        }
    }
}
