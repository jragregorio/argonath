import { getDeviceChannelName } from "@argonath/shared";
import type { RealtimeEvent } from "@argonath/shared";
import { createClient } from "@supabase/supabase-js";
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

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function useDeviceRealtime(
  deviceId: string | undefined,
  onEvent: (event: RealtimeEvent) => void
) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!deviceId || !isSupabaseRealtimeConfigured()) return;

    const supabase = getSupabase();
    const channel = supabase
      .channel(getDeviceChannelName(deviceId))
      .on("broadcast", { event: "argonath" }, (payload) => {
        callbackRef.current(payload.payload as RealtimeEvent);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId]);
}

export function useFamilyRealtime(
  deviceIds: string[],
  onEvent: (event: RealtimeEvent) => void
) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (deviceIds.length === 0 || !isSupabaseRealtimeConfigured()) return;

    const supabase = getSupabase();
    const channels = deviceIds.map((deviceId) =>
      supabase
        .channel(getDeviceChannelName(deviceId))
        .on("broadcast", { event: "argonath" }, (payload) => {
          callbackRef.current(payload.payload as RealtimeEvent);
        })
        .subscribe()
    );

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [deviceIds.join(",")]);
}
