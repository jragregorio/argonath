using System.Text;

namespace Warden.Core.Diagnostics;

/// <summary>
/// Dependency-free, never-throw local file logger.
/// Writes to %LOCALAPPDATA%\Warden\logs\warden-yyyyMMdd.log
/// </summary>
public static class WardenLog
{
    private const long MaxFileBytes = 5L * 1024 * 1024;
    private const int RetentionDays = 7;

    private static readonly object Gate = new();
    private static bool _initialized;
    private static LogLevel _minLevel = LogLevel.Information;
    private static string? _directory;
    private static string? _currentPath;
    private static DateTime _currentDateUtc;
    private static int _rollIndex;

    public enum LogLevel
    {
        Trace = 0,
        Debug = 1,
        Information = 2,
        Warning = 3,
        Error = 4,
    }

    public static void Init(string? category = null)
    {
        try
        {
            EnsureInitialized();
            if (!string.IsNullOrWhiteSpace(category))
            {
                Info(category!, "Logger initialized");
            }
        }
        catch
        {
            // Logging must never crash the app.
        }
    }

    public static void Trace(string category, string message, Exception? ex = null) =>
        Write(LogLevel.Trace, category, message, ex);

    public static void Debug(string category, string message, Exception? ex = null) =>
        Write(LogLevel.Debug, category, message, ex);

    public static void Info(string category, string message, Exception? ex = null) =>
        Write(LogLevel.Information, category, message, ex);

    public static void Warn(string category, string message, Exception? ex = null) =>
        Write(LogLevel.Warning, category, message, ex);

    public static void Error(string category, string message, Exception? ex = null) =>
        Write(LogLevel.Error, category, message, ex);

    public static string GetLogDirectory()
    {
        try
        {
            EnsureInitialized();
            return _directory ?? FallbackDirectory();
        }
        catch
        {
            return FallbackDirectory();
        }
    }

    private static string FallbackDirectory()
    {
        try
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Warden",
                "logs"
            );
        }
        catch
        {
            return ".";
        }
    }

    private static void Write(LogLevel level, string category, string message, Exception? ex)
    {
        try
        {
            EnsureInitialized();
            if (level < _minLevel)
            {
                return;
            }

            var levelTag = level switch
            {
                LogLevel.Trace => "TRC",
                LogLevel.Debug => "DBG",
                LogLevel.Information => "INF",
                LogLevel.Warning => "WRN",
                LogLevel.Error => "ERR",
                _ => "INF",
            };

            var cat = string.IsNullOrWhiteSpace(category) ? "App" : category.Trim();
            var utc = DateTime.UtcNow;
            var sb = new StringBuilder(256);
            sb.Append(utc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
            sb.Append(" [").Append(levelTag).Append("] [").Append(cat).Append("] ");
            sb.Append(message ?? string.Empty);

            if (ex != null)
            {
                sb.AppendLine();
                foreach (var line in (ex.ToString() ?? string.Empty).Split(
                             new[] { "\r\n", "\n" },
                             StringSplitOptions.None
                         ))
                {
                    sb.Append("  ").Append(line).AppendLine();
                }
            }

            var lineText = sb.ToString().TrimEnd('\r', '\n') + Environment.NewLine;

            lock (Gate)
            {
                RotateIfNeeded_NoLock(utc);
                if (string.IsNullOrEmpty(_currentPath))
                {
                    return;
                }

                using var stream = new FileStream(
                    _currentPath,
                    FileMode.Append,
                    FileAccess.Write,
                    FileShare.ReadWrite
                );
                var bytes = Encoding.UTF8.GetBytes(lineText);
                stream.Write(bytes, 0, bytes.Length);
                stream.Flush(flushToDisk: false);
            }
        }
        catch
        {
            // Swallow — logging must never crash the app.
        }
    }

    private static void EnsureInitialized()
    {
        if (_initialized)
        {
            return;
        }

        lock (Gate)
        {
            if (_initialized)
            {
                return;
            }

            _minLevel = ParseMinLevel(Environment.GetEnvironmentVariable("WARDEN_LOG_LEVEL"));
            _directory = FallbackDirectory();
            try
            {
                Directory.CreateDirectory(_directory);
            }
            catch
            {
                // Continue; writes will fail softly.
            }

            _currentDateUtc = DateTime.UtcNow.Date;
            _rollIndex = 0;
            _currentPath = Path.Combine(_directory, $"warden-{_currentDateUtc:yyyyMMdd}.log");
            TryPurgeOldLogs_NoLock();
            _initialized = true;
        }
    }

    private static LogLevel ParseMinLevel(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return LogLevel.Information;
        }

        return raw.Trim().ToLowerInvariant() switch
        {
            "trace" or "trc" => LogLevel.Trace,
            "debug" or "dbg" => LogLevel.Debug,
            "information" or "info" or "inf" => LogLevel.Information,
            "warning" or "warn" or "wrn" => LogLevel.Warning,
            "error" or "err" => LogLevel.Error,
            _ => LogLevel.Information,
        };
    }

    private static void RotateIfNeeded_NoLock(DateTime utcNow)
    {
        try
        {
            if (_directory is null)
            {
                return;
            }

            if (utcNow.Date != _currentDateUtc)
            {
                _currentDateUtc = utcNow.Date;
                _rollIndex = 0;
                _currentPath = Path.Combine(_directory, $"warden-{_currentDateUtc:yyyyMMdd}.log");
            }

            if (string.IsNullOrEmpty(_currentPath) || !File.Exists(_currentPath))
            {
                return;
            }

            var length = new FileInfo(_currentPath).Length;
            if (length < MaxFileBytes)
            {
                return;
            }

            _rollIndex++;
            var rolled = Path.Combine(
                _directory,
                $"warden-{_currentDateUtc:yyyyMMdd}.{_rollIndex}.log"
            );
            try
            {
                if (File.Exists(rolled))
                {
                    File.Delete(rolled);
                }

                File.Move(_currentPath, rolled);
            }
            catch
            {
                // Keep writing to current path if rename fails.
            }
        }
        catch
        {
            // Ignore rotation failures.
        }
    }

    private static void TryPurgeOldLogs_NoLock()
    {
        try
        {
            if (string.IsNullOrEmpty(_directory) || !Directory.Exists(_directory))
            {
                return;
            }

            var cutoff = DateTime.UtcNow.Date.AddDays(-RetentionDays);
            foreach (var file in Directory.EnumerateFiles(_directory, "warden-*.log"))
            {
                try
                {
                    var name = Path.GetFileName(file);
                    // warden-yyyyMMdd.log or warden-yyyyMMdd.N.log
                    if (name.Length < 19 || !name.StartsWith("warden-", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var datePart = name.Substring(7, 8);
                    if (!DateTime.TryParseExact(
                            datePart,
                            "yyyyMMdd",
                            System.Globalization.CultureInfo.InvariantCulture,
                            System.Globalization.DateTimeStyles.AssumeUniversal
                                | System.Globalization.DateTimeStyles.AdjustToUniversal,
                            out var fileDate
                        ))
                    {
                        continue;
                    }

                    if (fileDate.Date < cutoff)
                    {
                        File.Delete(file);
                    }
                }
                catch
                {
                    // Skip individual file failures.
                }
            }
        }
        catch
        {
            // Ignore retention failures.
        }
    }
}
