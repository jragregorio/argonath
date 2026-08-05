"use client";

import { Info } from "lucide-react";

export function DemoBanner() {
  return (
    <div
      role="status"
      className="border-b border-attention/30 bg-attention/10 px-4 py-2.5 text-center text-sm text-foreground sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2">
        <Info className="h-4 w-4 shrink-0 text-attention" aria-hidden="true" />
        <span>
          You&apos;re viewing a demo — nothing is saved.
        </span>
      </div>
    </div>
  );
}
