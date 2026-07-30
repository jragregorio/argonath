"use client";

import { useEffect, useState } from "react";
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
  onApply: (windows: AllowedWindow[]) => void;
  onClose: () => void;
};

export function AllowedWindowsDialog({
  open,
  windows,
  onApply,
  onClose,
}: AllowedWindowsDialogProps) {
  const [draft, setDraft] = useState<AllowedWindow[]>(windows);

  useEffect(() => {
    if (open) {
      setDraft(windows.map((window) => ({ ...window })));
    }
  }, [open, windows]);

  const dirty = !windowsEqual(draft, windows);

  const requestClose = () => {
    if (
      dirty &&
      !window.confirm("Discard schedule changes?")
    ) {
      return;
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Allowed windows"
      description="Times shown in your family time zone"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(draft.map((window) => ({ ...window })));
              onClose();
            }}
          >
            Apply schedule
          </Button>
        </div>
      }
    >
      <AllowedWindowsEditor windows={draft} onChange={setDraft} />
    </Modal>
  );
}
