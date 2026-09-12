"use client";

import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Modal } from "@/components/ui/modal";
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: "destructive" | "default";
  busy?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  variant = "destructive",
  busy = false,
}: ConfirmDialogProps) {
  const isDesktop = useIsDesktopMd();

  const desktopFooter = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant={variant === "destructive" ? "destructive" : "default"}
        size="sm"
        className="px-4"
        onClick={onConfirm}
        disabled={busy}
      >
        {busy ? "Please wait…" : confirmLabel}
      </Button>
    </div>
  );

  const mobileFooter = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="ghost"
        className="text-base"
        onClick={onClose}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant={variant === "destructive" ? "destructive" : "default"}
        className="text-base"
        onClick={onConfirm}
        disabled={busy}
      >
        {busy ? "Please wait…" : confirmLabel}
      </Button>
    </div>
  );

  if (isDesktop) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        description={description}
        footer={desktopFooter}
        size="sm"
        layout="plain"
      />
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      titleClassName="text-lg"
      showDone={false}
      footer={mobileFooter}
    >
      <p className="text-base leading-relaxed text-muted-foreground">{description}</p>
    </BottomSheet>
  );
}
