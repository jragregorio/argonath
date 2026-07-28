import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getDeviceChannelName } from "@warden/shared";
import type { RealtimeEvent } from "@warden/shared";

export { getDeviceChannelName };

let supabaseAdmin: SupabaseClient | null = null;
const deviceChannels = new Map<
  string,
  { channel: RealtimeChannel; ready: Promise<void> }
>();

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return Boolean(
    url &&
      url !== "https://placeholder.supabase.co" &&
      serviceKey &&
      serviceKey !== "placeholder" &&
      anonKey &&
      anonKey !== "placeholder"
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Supabase URL and service role key are required");
    }

    supabaseAdmin = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  return supabaseAdmin;
}

export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase URL and anon key are required");
  }

  return createClient(url, key);
}

async function getOrCreateDeviceChannel(deviceId: string): Promise<RealtimeChannel> {
  const existing = deviceChannels.get(deviceId);
  if (existing) {
    await existing.ready;
    return existing.channel;
  }

  const supabase = getSupabaseAdmin();
  const channelName = getDeviceChannelName(deviceId);
  const channel = supabase.channel(channelName);

  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      deviceChannels.delete(deviceId);
      void supabase.removeChannel(channel);
      reject(new Error(`Timed out subscribing to ${channelName}`));
    }, 800);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        clearTimeout(timeout);
        deviceChannels.delete(deviceId);
        reject(new Error(`Failed subscribing to ${channelName}: ${status}`));
      }
    });
  });

  deviceChannels.set(deviceId, { channel, ready });

  try {
    await ready;
    return channel;
  } catch (error) {
    deviceChannels.delete(deviceId);
    throw error;
  }
}

export async function broadcastToDevice(
  deviceId: string,
  event: RealtimeEvent
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const channel = await getOrCreateDeviceChannel(deviceId);
  const result = await channel.send({
    type: "broadcast",
    event: "warden",
    payload: event,
  });

  if (result !== "ok") {
    // Channel may be stale after a serverless cold start / idle timeout.
    deviceChannels.delete(deviceId);
    const supabase = getSupabaseAdmin();
    await supabase.removeChannel(channel);

    const retryChannel = await getOrCreateDeviceChannel(deviceId);
    const retry = await retryChannel.send({
      type: "broadcast",
      event: "warden",
      payload: event,
    });
    if (retry !== "ok") {
      throw new Error(`Broadcast send failed: ${retry}`);
    }
  }
}

export async function cleanupExpiredSnapshots(): Promise<number> {
  if (!isSupabaseConfigured()) {
    return 0;
  }

  const supabase = getSupabaseAdmin();
  const { prisma } = await import("@warden/db");

  const expired = await prisma.snapshot.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { id: true, storageKey: true },
  });

  if (expired.length === 0) return 0;

  const keys = expired.map((s) => s.storageKey);
  await supabase.storage.from("snapshots").remove(keys);
  await prisma.snapshot.deleteMany({
    where: { id: { in: expired.map((s) => s.id) } },
  });

  return expired.length;
}
