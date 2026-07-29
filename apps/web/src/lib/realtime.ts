import { getDeviceChannelName } from "@warden/shared";
import type { RealtimeEvent } from "@warden/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

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

  const channels = deviceIds.map((deviceId) =>
    supabase
      .channel(getDeviceChannelName(deviceId))
      .on("broadcast", { event: "warden" }, (payload) => {
        onEvent(payload.payload as RealtimeEvent);
      })
      .subscribe()
  );

  return () => {
    channels.forEach((channel) => {
      void supabase.removeChannel(channel);
    });
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
