"use client";

import { useEffect, useRef, useState } from "react";
import type { AllowedWindow } from "@warden/shared";
import { AllowedWindowsEditor } from "@/components/allowed-windows-editor";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

function windowsEqual(a: AllowedWindow[], b: AllowedWindow[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (window, index) =>
      window.day === b[index]?.day &&
      window.start === b[index]?.start &&
      window.end === b[index]?.end
  );
}

type AllowedWindowsDialogProps = {
  open: boolean;
  windows: AllowedWindow[];
  onSave: (windows: AllowedWindow[]) => void;
  onClose: () => void;
  saving?: boolean;
  errorMessage?: string | null;
  alsoSavingNote?: string | null;
};

export function AllowedWindowsDialog({
  open,
  windows,
  onSave,
  onClose,
  saving = false,
  errorMessage = null,
  alsoSavingNote = null,
}: AllowedWindowsDialogProps) {
  const [draft, setDraft] = useState<AllowedWindow[]>(windows);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(windows.map((window) => ({ ...window })));
    }
    wasOpen.current = open;
  }, [open, windows]);

  const dirty = !windowsEqual(draft, windows);

  const requestClose = () => {
    if (saving) return;
    if (dirty && !window.confirm("Discard schedule changes?")) {
      return;
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Allowed windows"
      description="Times shown in your family time zone · saves immediately"
      footer={
        <div className="space-y-3">
          {alsoSavingNote && (
            <p className="text-xs text-muted-foreground">{alsoSavingNote}</p>
          )}
          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={requestClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !dirty}
              onClick={() =>
                onSave(draft.map((window) => ({ ...window })))
              }
            >
              {saving ? "Saving…" : "Save schedule"}
            </Button>
          </div>
        </div>
      }
    >
      <AllowedWindowsEditor windows={draft} onChange={setDraft} />
    </Modal>
  );
}
