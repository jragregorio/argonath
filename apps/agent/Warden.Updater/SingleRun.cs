namespace Warden.Updater;

/// <summary>Machine-wide single-instance guard (repeated Update clicks do nothing extra).</summary>
public static class SingleRun
{
    public static bool TryAcquire(string name, out IDisposable? handle)
    {
        var mutex = new Mutex(initiallyOwned: false, name);
        bool acquired;
        try
        {
            acquired = mutex.WaitOne(0);
        }
        catch (AbandonedMutexException)
        {
            acquired = true; // previous run crashed; we own it now
        }

        if (!acquired)
        {
            mutex.Dispose();
            handle = null;
            return false;
        }

        handle = new Releaser(mutex);
        return true;
    }

    private sealed class Releaser(Mutex mutex) : IDisposable
    {
        public void Dispose()
        {
            mutex.ReleaseMutex();
            mutex.Dispose();
        }
    }
}
