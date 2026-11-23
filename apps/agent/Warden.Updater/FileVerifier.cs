using System.Security.Cryptography;

namespace Warden.Updater;

public static class FileVerifier
{
    public static bool Verify(string path, string sha256Hex, long size)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Verify(stream, sha256Hex, size);
    }

    /// <summary>Hashes <paramref name="stream"/> from the start; size and SHA-256 must both match.</summary>
    public static bool Verify(Stream stream, string sha256Hex, long size)
    {
        if (stream.Length != size)
        {
            return false;
        }

        stream.Position = 0;
        var actual = Convert.ToHexString(SHA256.HashData(stream));
        stream.Position = 0;
        return string.Equals(actual, sha256Hex?.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}
