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

/** Same idea for a child's tray message (push arrived while the app is open). */
export const CHILD_MESSAGE_PUSH_EVENT = "warden:child-message-push";

export type ChildMessagePushDetail = {
  messageId: string;
  title: string;
  message: string;
};

const NUDGE_REPLY_TOAST_MS = 8000;

/**
 * Dashboard-wide timed toasts, mounted once in the dashboard shell:
 * - a child replied to a nudge **this parent** sent;
 * - a child sent a message from the tray (every parent).
 * Deduped per nudge / message across realtime and the foreground push fallback.
 */
export function NudgeReplyToaster() {
  const { showToast } = useToast();
  const { data: me } = trpc.auth.me.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const myUserId = me?.user?.id ?? null;
  const shownRef = useRef(new Set<string>());

  const showOnce = (key: string, message: string, title = "Nudge reply") => {
    if (shownRef.current.has(key)) return;
    shownRef.current.add(key);
    showToast(message, "success", {
      title,
      placement: "top",
      durationMs: NUDGE_REPLY_TOAST_MS,
      timed: true,
    });
  };

  useFamilyRealtimeEvent((event) => {
    if (event.type === "message:received") {
      const payload = event.payload as
        | { messageId?: string; childName?: string | null; text?: string | null }
        | undefined;
      if (!payload?.messageId || !payload.text) return;
      showOnce(
        `message:${payload.messageId}`,
        payload.text,
        `Message from ${payload.childName ?? "your child"}`
      );
      return;
    }
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
    const onMessagePush = (e: Event) => {
      const detail = (e as CustomEvent<ChildMessagePushDetail>).detail;
      if (detail?.messageId && detail.message) {
        showOnceRef.current(
          `message:${detail.messageId}`,
          detail.message,
          detail.title || "Message from your child"
        );
      }
    };
    window.addEventListener(NUDGE_REPLY_PUSH_EVENT, onPush);
    window.addEventListener(CHILD_MESSAGE_PUSH_EVENT, onMessagePush);
    return () => {
      window.removeEventListener(NUDGE_REPLY_PUSH_EVENT, onPush);
      window.removeEventListener(CHILD_MESSAGE_PUSH_EVENT, onMessagePush);
    };
  }, []);

  return null;
}
