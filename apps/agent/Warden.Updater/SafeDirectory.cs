namespace Warden.Updater;

public static class SafeDirectory
{
    /// <summary>
    /// Removes whatever is at <paramref name="path"/>. A junction/symlink (which a standard user
    /// can plant) is removed as a link only — its target is never touched.
    /// </summary>
    public static void RemoveExisting(string path)
    {
        var info = new DirectoryInfo(path);
        if (!info.Exists)
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }

            return;
        }

        if (info.Attributes.HasFlag(FileAttributes.ReparsePoint))
        {
            info.Delete(recursive: false);
            return;
        }

        foreach (var child in info.EnumerateFileSystemInfos())
        {
            if (child is DirectoryInfo dir)
            {
                RemoveExisting(dir.FullName);
            }
            else
            {
                child.Attributes = FileAttributes.Normal;
                child.Delete();
            }
        }

        info.Delete(recursive: false);
    }
}
