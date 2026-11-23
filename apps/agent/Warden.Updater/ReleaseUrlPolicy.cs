namespace Warden.Updater;

/// <summary>
/// Only GitHub Release assets of the Warden repo may be downloaded. GitHub then redirects to its
/// own file host; the SHA-256 check is what proves the bytes are the published MSI.
/// </summary>
public static class ReleaseUrlPolicy
{
    private const string AllowedHost = "github.com";
    private const string AllowedPathPrefix = "/jragregorio/warden-releases/releases/download/";

    public static bool IsAllowed(Uri url) =>
        url.IsAbsoluteUri
        && url.Scheme == Uri.UriSchemeHttps
        && string.Equals(url.Host, AllowedHost, StringComparison.OrdinalIgnoreCase)
        && url.IsDefaultPort
        && url.AbsolutePath.StartsWith(AllowedPathPrefix, StringComparison.Ordinal);
}
