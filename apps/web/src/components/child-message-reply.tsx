"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";

const MAX_REPLY_LENGTH = 200;

const REPLY_PRESETS = [
  "On my way",
  "Give me a minute",
  "Yes",
  "Not now",
] as const;

export type ChildMessageReplyTarget = {
  messageId: string;
  deviceId: string;
  childName: string | null;
  text: string;
};

type ChildMessageReplyContextValue = {
  openReply: (target: ChildMessageReplyTarget) => void;
};

const ChildMessageReplyContext =
  createContext<ChildMessageReplyContextValue | null>(null);

/**
 * Null outside the authenticated dashboard (e.g. the demo), so activity rows
 * there simply don't show a Reply button.
 */
export function useChildMessageReply() {
  return useContext(ChildMessageReplyContext);
}

/**
 * Lets any Activity row open a reply to a child's tray message. The reply is
 * sent as a nudge linked to the message, so it reuses the nudge overlay on the PC.
 */
export function ChildMessageReplyProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [target, setTarget] = useState<ChildMessageReplyTarget | null>(null);
  const [reply, setReply] = useState("");
  const inputId = useId();
  const isDesktop = useIsDesktopMd();
  const { showToast } = useToast();
  const utils = trpc.useUtils();

  const sendNudge = trpc.device.sendNudge.useMutation({
    onSuccess: () => {
      showToast(
        `Reply sent to ${target?.childName ?? "your child"}.`,
        "success"
      );
      setTarget(null);
      setReply("");
      void utils.dashboard.activity.invalidate();
    },
    onError: (err) => {
      showToast(err.message || "Could not send reply", "error");
    },
  });

  const openReply = useCallback((next: ChildMessageReplyTarget) => {
    setReply("");
    setTarget(next);
  }, []);

  const close = () => {
    if (sendNudge.isPending) return;
    setTarget(null);
    setReply("");
  };

  const trimmed = reply.trim();
  const canSend = Boolean(target) && trimmed.length > 0 && !sendNudge.isPending;

  const send = () => {
    if (!target || !canSend) return;
    sendNudge.mutate({
      deviceId: target.deviceId,
      message: trimmed,
      replyToMessageId: target.messageId,
    });
  };

  const value = useMemo(() => ({ openReply }), [openReply]);

  const title = `Reply to ${target?.childName ?? "your child"}`;
  const description = "Shows on their screen like a nudge";

  const body = target ? (
    <div className="space-y-4">
      <blockquote className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-base text-foreground/90 md:text-sm">
        &ldquo;{target.text}&rdquo;
      </blockquote>
      <div className="space-y-2">
        <Label htmlFor={inputId} className="text-lg md:text-sm">
          Your reply
        </Label>
        <Input
          id={inputId}
          value={reply}
          maxLength={MAX_REPLY_LENGTH}
          placeholder="Type a reply…"
          autoFocus
          onChange={(event) => setReply(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              send();
            }
          }}
          disabled={sendNudge.isPending}
          className="min-h-14 text-lg md:h-10 md:min-h-10 md:text-sm"
        />
        <p className="text-base text-muted-foreground md:text-xs">
          {reply.length}/{MAX_REPLY_LENGTH}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {REPLY_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={sendNudge.isPending}
            onClick={() => setReply(preset)}
            className="min-h-12 rounded-lg border border-border px-3 py-2 text-base text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50 md:min-h-0 md:px-2.5 md:py-1.5 md:text-xs"
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="ghost"
        className="max-md:text-lg"
        onClick={close}
        disabled={sendNudge.isPending}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="attention"
        className="max-md:text-lg"
        onClick={send}
        disabled={!canSend}
      >
        <Reply className="mr-1.5 h-4 w-4 max-md:h-5 max-md:w-5" />
        {sendNudge.isPending ? "Sending…" : "Send reply"}
      </Button>
    </div>
  );

  return (
    <ChildMessageReplyContext.Provider value={value}>
      {children}
      {isDesktop ? (
        <Modal
          open={target !== null}
          onClose={close}
          title={title}
          description={description}
          className="w-[min(24rem,calc(100vw-2rem))]"
          footer={footer}
        >
          {body}
        </Modal>
      ) : (
        <BottomSheet
          open={target !== null}
          onClose={close}
          title={title}
          description={description}
          titleClassName="text-xl"
          descriptionClassName="text-base leading-relaxed"
          showDone={false}
          footer={footer}
        >
          {body ?? <span />}
        </BottomSheet>
      )}
    </ChildMessageReplyContext.Provider>
  );
}
