using System.Text.Json;
using Argonath.Core.Models;

namespace Argonath.Core.Services;

public class ConfigStore
{
    private readonly string _configPath;

    public ConfigStore()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var dir = Path.Combine(appData, "Argonath");
        Directory.CreateDirectory(dir);
        _configPath = Path.Combine(dir, "config.json");

        // Migrate from pre-rename Guardian config if present.
        var legacyPath = Path.Combine(appData, "Guardian", "config.json");
        if (!File.Exists(_configPath) && File.Exists(legacyPath))
        {
            File.Copy(legacyPath, _configPath);
        }
    }

    public AgentConfig Load()
    {
        if (!File.Exists(_configPath))
            return new AgentConfig();

        var json = File.ReadAllText(_configPath);
        return JsonSerializer.Deserialize<AgentConfig>(json) ?? new AgentConfig();
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
}
