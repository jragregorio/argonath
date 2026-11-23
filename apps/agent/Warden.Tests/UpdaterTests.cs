using System.Security.Cryptography;
using Warden.Updater;
using Xunit;

namespace Warden.Tests;

public class UpdaterTests : IDisposable
{
    private const string GoodUrl =
        "https://github.com/jragregorio/warden-releases/releases/download/agent-v0.6.29/Warden-0.6.29-x64.msi";

    private readonly string _root = Path.Combine(
        Path.GetTempPath(),
        "warden-updater-tests-" + Guid.NewGuid().ToString("N")
    );

    private string StatusPath => Path.Combine(_root, "update-status.json");
    private string UpdatesDir => Path.Combine(_root, "downloads");

    public UpdaterTests() => Directory.CreateDirectory(_root);

    public void Dispose()
    {
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch
        {
            // best-effort temp cleanup
        }
    }

    // ---- UpdateDecision ----

    [Theory]
    [InlineData("0.6.28", "0.6.29", true)]
    [InlineData("0.6.29", "0.6.29", false)]
    [InlineData("0.6.29", "0.6.10", false)]
    [InlineData("0.6.9", "0.6.10", true)]
    [InlineData("0.6.28", "junk", false)]
    [InlineData("0.6.28", "0.6.29/../x", false)]
    public void IsNewer(string installed, string candidate, bool expected) =>
        Assert.Equal(expected, UpdateDecision.IsNewer(installed, candidate));

    // ---- ReleaseUrlPolicy ----

    [Theory]
    [InlineData(GoodUrl, true)]
    [InlineData("http://github.com/jragregorio/warden-releases/releases/download/agent-v0.6.29/Warden-0.6.29-x64.msi", false)]
    [InlineData("https://evil.com/jragregorio/warden-releases/releases/download/agent-v0.6.29/Warden-0.6.29-x64.msi", false)]
    [InlineData("https://github.com/other/repo/releases/download/agent-v0.6.29/Warden-0.6.29-x64.msi", false)]
    [InlineData("https://github.com/jragregorio/argonath/releases/download/agent-v0.6.29/Warden-0.6.29-x64.msi", false)]
    [InlineData("https://github.com.evil.com/jragregorio/warden-releases/releases/download/a/b.msi", false)]
    public void IsAllowed(string url, bool expected) =>
        Assert.Equal(expected, ReleaseUrlPolicy.IsAllowed(new Uri(url)));

    // ---- FileVerifier ----

    [Fact]
    public void Verify_MatchingHashAndSize_True()
    {
        var (path, sha, size) = WriteFile(new byte[] { 1, 2, 3 });
        Assert.True(FileVerifier.Verify(path, sha.ToUpperInvariant(), size));
    }

    [Fact]
    public void Verify_WrongHash_False()
    {
        var (path, _, size) = WriteFile(new byte[] { 1, 2, 3 });
        Assert.False(FileVerifier.Verify(path, new string('0', 64), size));
    }

    [Fact]
    public void Verify_WrongSize_False()
    {
        var (path, sha, size) = WriteFile(new byte[] { 1, 2, 3 });
        Assert.False(FileVerifier.Verify(path, sha, size + 1));
    }

    // ---- UpdaterRunner ----

    [Fact]
    public async Task Runner_UpToDate_NoDownloadNoMsiNoRelaunch()
    {
        var env = new FakeEnv { Installed = "0.6.29", Release = Release(new byte[] { 9 }, "0.6.29") };
        var status = await Runner(env).RunAsync();
        Assert.Equal("up_to_date", status.Result);
        Assert.Empty(env.Downloads);
        Assert.Empty(env.MsiRuns);
        Assert.Empty(env.TasksRun);
        Assert.Equal("up_to_date", UpdateStatusStore.Read(StatusPath)!.Result);
    }

    [Fact]
    public async Task Runner_NoReleasePublished_IsUpToDate()
    {
        var env = new FakeEnv { Installed = "0.6.29", Release = null };
        Assert.Equal("up_to_date", (await Runner(env).RunAsync()).Result);
        Assert.Empty(env.Downloads);
    }

    [Fact]
    public async Task Runner_HashMismatch_DoesNotInstall()
    {
        var env = new FakeEnv
        {
            Installed = "0.6.28",
            Release = Release(new byte[] { 1, 2 }, "0.6.29"),
            DownloadBytes = new byte[] { 6, 6 }, // tampered payload, same size
        };
        var status = await Runner(env).RunAsync();
        Assert.Equal("failed", status.Result);
        Assert.Single(env.Downloads);
        Assert.Empty(env.MsiRuns);
        Assert.Empty(env.TasksRun);
        Assert.False(File.Exists(env.Downloads[0].Dest));
    }

    [Fact]
    public async Task Runner_DisallowedUrl_DoesNotDownload()
    {
        var release = Release(new byte[] { 1 }, "0.6.29") with { DownloadUrl = "https://evil.com/x.msi" };
        var env = new FakeEnv { Installed = "0.6.28", Release = release };
        var status = await Runner(env).RunAsync();
        Assert.Equal("failed", status.Result);
        Assert.Empty(env.Downloads);
        Assert.Empty(env.MsiRuns);
    }

    [Fact]
    public async Task Runner_FetchThrows_RecordsFailure()
    {
        var env = new FakeEnv { Installed = "0.6.28", FetchThrows = true };
        var status = await Runner(env).RunAsync();
        Assert.Equal("failed", status.Result);
        Assert.Empty(env.MsiRuns);
        Assert.Equal("failed", UpdateStatusStore.Read(StatusPath)!.Result);
    }

    [Fact]
    public async Task Runner_MsiFails_StillRelaunchesAndRecordsFailure()
    {
        var bytes = new byte[] { 4, 5, 6 };
        var env = new FakeEnv
        {
            Installed = "0.6.28",
            Release = Release(bytes, "0.6.29"),
            DownloadBytes = bytes,
            MsiExitCode = 1603,
        };
        var status = await Runner(env).RunAsync();
        Assert.Equal("failed", status.Result);
        Assert.Equal(1603, status.MsiExitCode);
        Assert.Single(env.MsiRuns);
        Assert.Equal(new[] { @"Warden\WardenTray" }, env.TasksRun);
        var stored = UpdateStatusStore.Read(StatusPath)!;
        Assert.Equal("0.6.28", stored.FromVersion);
        Assert.Equal("0.6.29", stored.ToVersion);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(3010)]
    public async Task Runner_MsiSucceeds_RelaunchesAndRecordsSuccess(int exitCode)
    {
        var bytes = new byte[] { 7, 8, 9 };
        var env = new FakeEnv
        {
            Installed = "0.6.28",
            Release = Release(bytes, "0.6.29"),
            DownloadBytes = bytes,
            MsiExitCode = exitCode,
        };
        var status = await Runner(env).RunAsync();
        Assert.Equal("succeeded", status.Result);
        Assert.Single(env.TasksRun);
        Assert.False(File.Exists(env.MsiRuns[0]), "downloaded MSI is cleaned up");
    }

    [Fact]
    public async Task Runner_MsiFileIsLockedAgainstWritesWhileInstalling()
    {
        var bytes = new byte[] { 1, 1, 1 };
        var env = new FakeEnv { Installed = "0.6.28", Release = Release(bytes, "0.6.29"), DownloadBytes = bytes };
        env.OnMsi = path => Assert.ThrowsAny<IOException>(() => File.WriteAllBytes(path, new byte[] { 0 }));
        Assert.Equal("succeeded", (await Runner(env).RunAsync()).Result);
    }

    // ---- TrayRelauncher ----

    [Fact]
    public void TrayRelauncher_RunsEveryWardenTrayTask_IgnoresFailures()
    {
        var env = new FakeEnv
        {
            TaskNames = new[]
            {
                @"\Warden\WardenTray",
                @"\Warden\WardenTray-kid",
                @"\Warden\WardenUpdater",
                @"\Other\Task",
            },
            FailingTask = @"Warden\WardenTray",
        };
        TrayRelauncher.RelaunchAll(env);
        Assert.Equal(new[] { @"Warden\WardenTray", @"Warden\WardenTray-kid" }, env.TasksRun);
    }

    // ---- SingleRun ----

    [Fact]
    public void Runner_SecondInstance_ExitsWithoutWork()
    {
        var name = "WardenUpdaterTest-" + Guid.NewGuid().ToString("N");
        using var held = new ManualResetEventSlim();
        using var release = new ManualResetEventSlim();
        var holder = new Thread(() =>
        {
            SingleRun.TryAcquire(name, out var handle);
            held.Set();
            release.Wait();
            handle?.Dispose();
        });
        holder.Start();
        held.Wait();

        var second = true;
        var contender = new Thread(() =>
        {
            second = SingleRun.TryAcquire(name, out var h);
            h?.Dispose();
        });
        contender.Start();
        contender.Join();
        release.Set();
        holder.Join();

        Assert.False(second);
    }

    // ---- helpers ----

    private UpdaterRunner Runner(FakeEnv env) => new(env, StatusPath, UpdatesDir);

    private static ReleaseInfo Release(byte[] bytes, string version) =>
        new(
            version,
            Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
            bytes.Length,
            GoodUrl.Replace("0.6.29", version)
        );

    private (string Path, string Sha, long Size) WriteFile(byte[] bytes)
    {
        var path = Path.Combine(_root, Guid.NewGuid().ToString("N") + ".bin");
        File.WriteAllBytes(path, bytes);
        return (path, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), bytes.Length);
    }

    private sealed class FakeEnv : IUpdaterEnvironment
    {
        public string Installed { get; set; } = "0.6.28";
        public ReleaseInfo? Release { get; set; }
        public bool FetchThrows { get; set; }
        public byte[] DownloadBytes { get; set; } = Array.Empty<byte>();
        public int MsiExitCode { get; set; }
        public Action<string>? OnMsi { get; set; }
        public IReadOnlyList<string> TaskNames { get; set; } =
            new[] { @"\Warden\WardenTray", @"\Warden\WardenUpdater" };
        public string? FailingTask { get; set; }

        public List<(string Url, string Dest)> Downloads { get; } = new();
        public List<string> MsiRuns { get; } = new();
        public List<string> TasksRun { get; } = new();

        public string InstalledVersion() => Installed;

        public Task<ReleaseInfo?> FetchLatestAsync() =>
            FetchThrows ? throw new HttpRequestException("offline") : Task.FromResult(Release);

        public void EnsureWorkDirectory(string path) => Directory.CreateDirectory(path);

        public Task DownloadAsync(string url, string dest)
        {
            Downloads.Add((url, dest));
            File.WriteAllBytes(dest, DownloadBytes);
            return Task.CompletedTask;
        }

        public int RunMsiexec(string msiPath, string logPath)
        {
            MsiRuns.Add(msiPath);
            OnMsi?.Invoke(msiPath);
            return MsiExitCode;
        }

        public IReadOnlyList<string> QueryTrayTaskNames() => TaskNames;

        public int RunTask(string name)
        {
            TasksRun.Add(name);
            return string.Equals(name, FailingTask, StringComparison.OrdinalIgnoreCase) ? 1 : 0;
        }

        public void Log(string line)
        {
        }
    }
}
