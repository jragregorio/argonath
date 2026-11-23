namespace Warden.Updater;

/// <summary>Server's latest-release answer (GET /api/agent/release/latest).</summary>
public sealed record ReleaseInfo(string Version, string Sha256, long SizeBytes, string DownloadUrl);
