"use client";

import { getDeviceChannelName } from "@warden/shared";
import type { RealtimeEvent } from "@warden/shared";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

const RECONNECT_BACKOFF_MS = 1000;
const MAX_RESUBSCRIBE_ATTEMPTS = 3;
const VISIBILITY_DEBOUNCE_MS = 400;

function isSupabaseRealtimeConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return Boolean(
    url &&
      key &&
      url !== "https://placeholder.supabase.co" &&
      key !== "placeholder"
  );
}

let supabaseSingleton: SupabaseClient | null = null;

/** One browser Supabase client for the whole dashboard session. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseRealtimeConfigured()) return null;
  if (!supabaseSingleton) {
    supabaseSingleton = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return supabaseSingleton;
}

export function isRealtimeConfigured() {
  return isSupabaseRealtimeConfigured();
}

type ChannelEntry = {
  deviceId: string;
  channel: RealtimeChannel;
  resubscribeAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
};

function isChannelFailureStatus(status: string) {
  return (
    status === "CHANNEL_ERROR" ||
    status === "TIMED_OUT" ||
    status === "CLOSED"
  );
}

/**
 * Low-level multi-device channel subscription.
 * Prefer FamilyRealtimeProvider / useFamilyRealtimeEvent in dashboard UI.
 */
export function subscribeDeviceChannels(
  deviceIds: string[],
  onEvent: (event: RealtimeEvent) => void
): () => void {
  const supabase = getSupabase();
  if (!supabase || deviceIds.length === 0) {
    return () => {};
  }

  const entries: ChannelEntry[] = [];
  let disposed = false;
  let visibilityDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function clearReconnectTimer(entry: ChannelEntry) {
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
  }

  async function removeEntry(entry: ChannelEntry) {
    clearReconnectTimer(entry);
    const index = entries.indexOf(entry);
    if (index >= 0) {
      entries.splice(index, 1);
    }
    try {
      await supabase!.removeChannel(entry.channel);
    } catch (error) {
      console.warn("[warden] realtime channel remove failed:", error);
    }
  }

  function subscribeChannel(deviceId: string): ChannelEntry {
    const channelName = getDeviceChannelName(deviceId);
    const channel = supabase!.channel(channelName);

    channel.on("broadcast", { event: "warden" }, (payload) => {
      onEvent(payload.payload as RealtimeEvent);
    });

    channel.subscribe((status) => {
      if (disposed) return;

      const entry = entries.find((e) => e.deviceId === deviceId);
      if (!entry) return;

      if (status === "SUBSCRIBED") {
        entry.resubscribeAttempts = 0;
        return;
      }

      if (!isChannelFailureStatus(status)) return;

      if (entry.resubscribeAttempts >= MAX_RESUBSCRIBE_ATTEMPTS) {
        console.warn(
          `[warden] realtime channel ${channelName} failed after ${MAX_RESUBSCRIBE_ATTEMPTS} attempts`
        );
        return;
      }

      entry.resubscribeAttempts += 1;
      const delay = RECONNECT_BACKOFF_MS * entry.resubscribeAttempts;
      clearReconnectTimer(entry);

      entry.reconnectTimer = setTimeout(() => {
        entry.reconnectTimer = null;
        if (disposed) return;

        const attempts = entry.resubscribeAttempts;
        void removeEntry(entry).then(() => {
          if (disposed) return;
          const next = subscribeChannel(deviceId);
          next.resubscribeAttempts = attempts;
          entries.push(next);
        });
      }, delay);
    });

    return {
      deviceId,
      channel,
      resubscribeAttempts: 0,
      reconnectTimer: null,
    };
  }

  async function teardownChannels() {
    const toRemove = [...entries];
    await Promise.all(toRemove.map((entry) => removeEntry(entry)));
  }

  function resubscribeAll() {
    if (disposed) return;
    void teardownChannels().then(() => {
      if (disposed) return;
      for (const deviceId of deviceIds) {
        entries.push(subscribeChannel(deviceId));
      }
    });
  }

  function scheduleResubscribeAll() {
    if (visibilityDebounceTimer) {
      clearTimeout(visibilityDebounceTimer);
    }
    visibilityDebounceTimer = setTimeout(() => {
      visibilityDebounceTimer = null;
      resubscribeAll();
    }, VISIBILITY_DEBOUNCE_MS);
  }

  let wasHidden = false;

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      wasHidden = true;
      return;
    }
    // Skip the first visible event on cold load (Capacitor WebView initial paint).
    if (!wasHidden) return;
    scheduleResubscribeAll();
  }

  function onOnline() {
    // Match visibility: ignore cold-start online; wait for a real background period.
    if (!wasHidden) return;
    scheduleResubscribeAll();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
  }

  for (const deviceId of deviceIds) {
    entries.push(subscribeChannel(deviceId));
  }

  return () => {
    disposed = true;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
    }
    if (visibilityDebounceTimer) {
      clearTimeout(visibilityDebounceTimer);
    }
    void teardownChannels();
  };
}

/** @deprecated Prefer FamilyRealtimeProvider — kept for rare single-device use. */
export function useDeviceRealtime(
  deviceId: string | undefined,
  onEvent: (event: RealtimeEvent) => void
) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!deviceId) return;
    return subscribeDeviceChannels([deviceId], (event) => {
      callbackRef.current(event);
    });
  }, [deviceId]);
}

/** @deprecated Prefer FamilyRealtimeProvider / useFamilyRealtimeEvent. */
export function useFamilyRealtime(
  deviceIds: string[],
  onEvent: (event: RealtimeEvent) => void
) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    return subscribeDeviceChannels(deviceIds, (event) => {
      callbackRef.current(event);
    });
  }, [deviceIds.join(",")]);
}
