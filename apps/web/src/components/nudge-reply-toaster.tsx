"use client";

import { useEffect, useRef } from "react";
import {
  formatNudgeReplyMessage,
  isMeaningfulNudgeReply,
} from "@warden/shared";
import { useFamilyRealtimeEvent } from "@/lib/family-realtime";
import { useToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";

/**
 * Fired by NativePushBootstrap when a nudge-reply push arrives while the
 * Capacitor app is open (the system notification is cancelled in favour of
 * this toast). Covers the case where realtime is late or disconnected.
 */
export const NUDGE_REPLY_PUSH_EVENT = "warden:nudge-reply-push";

export type NudgeReplyPushDetail = {
  nudgeId: string;
  message: string;
};

const NUDGE_REPLY_TOAST_MS = 8000;

/**
 * Dashboard-wide timed toast when a child replies to a nudge **this parent**
 * sent. Mounted once in the dashboard shell so it shows on every page.
 * Deduped per nudge across realtime and the foreground push fallback.
 */
export function NudgeReplyToaster() {
  const { showToast } = useToast();
  const { data: me } = trpc.auth.me.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const myUserId = me?.user?.id ?? null;
  const shownRef = useRef(new Set<string>());

  const showOnce = (nudgeId: string, message: string) => {
    if (shownRef.current.has(nudgeId)) return;
    shownRef.current.add(nudgeId);
    showToast(message, "success", {
      title: "Nudge reply",
      placement: "top",
      durationMs: NUDGE_REPLY_TOAST_MS,
      timed: true,
    });
  };

  useFamilyRealtimeEvent((event) => {
    if (event.type !== "nudge:seen" || !myUserId) return;
    const payload = event.payload as
      | {
          nudgeId?: string;
          response?: string | null;
          responseText?: string | null;
          requestedBy?: string | null;
          childName?: string | null;
        }
      | undefined;
    if (!payload?.nudgeId || payload.requestedBy !== myUserId) return;
    if (!isMeaningfulNudgeReply(payload.response, payload.responseText)) return;
    showOnce(
      payload.nudgeId,
      formatNudgeReplyMessage(
        payload.childName ?? "Your child",
        payload.response,
        payload.responseText
      )
    );
  });

  const showOnceRef = useRef(showOnce);
  showOnceRef.current = showOnce;

  useEffect(() => {
    const onPush = (e: Event) => {
      const detail = (e as CustomEvent<NudgeReplyPushDetail>).detail;
      if (detail?.nudgeId && detail.message) {
        showOnceRef.current(detail.nudgeId, detail.message);
      }
    };
    window.addEventListener(NUDGE_REPLY_PUSH_EVENT, onPush);
    return () => window.removeEventListener(NUDGE_REPLY_PUSH_EVENT, onPush);
  }, []);

  return null;
}
