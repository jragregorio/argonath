"use client";

import { useEffect, useId, useState } from "react";
import { Bell, ChevronDown } from "lucide-react";
import { DEFAULT_NUDGE_MESSAGE } from "@warden/shared";
import { cn } from "@warden/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { BottomSheet } from "@/components/ui/bottom-sheet";

const MAX_MESSAGE_LENGTH = 200;

const NUDGE_PRESETS = [
  "Dinner time",
  "Come downstairs",
  "Wrap it up",
  "Need you for a minute",
] as const;

type NudgeControlsProps = {
  disabled?: boolean;
  isSending?: boolean;
  title?: string;
  onSend: (message?: string) => void;
  className?: string;
};

function useIsDesktopMd() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

function NudgeMessageForm({
  message,
  onMessageChange,
  onSubmit,
  isSending,
  disabled,
  inputId,
}: {
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  isSending: boolean;
  disabled: boolean;
  inputId: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={inputId}>Message</Label>
        <Input
          id={inputId}
          value={message}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={DEFAULT_NUDGE_MESSAGE}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          disabled={disabled || isSending}
        />
        <p className="text-xs text-muted-foreground">
          Leave blank for the default message · {message.length}/
          {MAX_MESSAGE_LENGTH}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {NUDGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled || isSending}
            onClick={() => onMessageChange(preset)}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NudgeControls({
  disabled = false,
  isSending = false,
  title = "Send a gentle attention nudge",
  onSend,
  className,
}: NudgeControlsProps) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [message, setMessage] = useState("");
  const inputId = useId();
  const isDesktop = useIsDesktopMd();

  const openCompose = () => {
    setMessage("");
    setComposeOpen(true);
  };

  const closeCompose = () => {
    if (isSending) return;
    setComposeOpen(false);
    setMessage("");
  };

  const sendDefault = () => {
    onSend();
  };

  const sendCustom = () => {
    if (disabled || isSending) return;
    const trimmed = message.trim();
    setComposeOpen(false);
    setMessage("");
    onSend(trimmed.length > 0 ? trimmed : undefined);
  };

  const form = (
    <NudgeMessageForm
      message={message}
      onMessageChange={setMessage}
      onSubmit={sendCustom}
      isSending={isSending}
      disabled={disabled}
      inputId={inputId}
    />
  );

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="ghost"
        onClick={closeCompose}
        disabled={isSending}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="attention"
        onClick={sendCustom}
        disabled={disabled || isSending}
      >
        <Bell className="mr-1.5 h-4 w-4" />
        {isSending ? "Sending…" : "Send nudge"}
      </Button>
    </div>
  );

  return (
    <>
      <div className={cn("inline-flex w-full sm:w-auto", className)}>
        <Button
          type="button"
          variant="attention"
          className="w-full rounded-r-none sm:w-auto"
          onClick={sendDefault}
          disabled={disabled || isSending}
          title={title}
        >
          <Bell className="mr-1.5 h-4 w-4" />
          Nudge
        </Button>
        <Button
          type="button"
          variant="attention"
          className="shrink-0 rounded-l-none border-l border-attention-foreground/20 px-2.5"
          onClick={openCompose}
          disabled={disabled || isSending}
          title="Send nudge with a custom message"
          aria-label="Send nudge with a custom message"
          aria-haspopup="dialog"
          aria-expanded={composeOpen}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {isDesktop ? (
        <Modal
          open={composeOpen}
          onClose={closeCompose}
          title="Nudge with a message"
          description="Shows briefly on the child's screen"
          className="w-[min(24rem,calc(100vw-2rem))]"
          footer={footer}
        >
          {form}
        </Modal>
      ) : (
        <BottomSheet
          open={composeOpen}
          onClose={closeCompose}
          title="Nudge with a message"
          description="Shows briefly on the child's screen"
          showDone={false}
          footer={footer}
        >
          {form}
        </BottomSheet>
      )}
    </>
  );
}
