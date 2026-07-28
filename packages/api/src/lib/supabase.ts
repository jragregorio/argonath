import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getDeviceChannelName } from "@warden/shared";
import type { RealtimeEvent } from "@warden/shared";

export { getDeviceChannelName };

let supabaseAdmin: SupabaseClient | null = null;

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

export async function broadcastToDevice(
  deviceId: string,
  event: RealtimeEvent
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const channel = supabase.channel(`device:${deviceId}`);
  await channel.send({
    type: "broadcast",
    event: "warden",
    payload: event,
  });
  await supabase.removeChannel(channel);
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
