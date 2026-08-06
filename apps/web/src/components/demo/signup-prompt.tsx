"use client";

import { useDemo } from "@/lib/demo/demo-provider";
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
function SignupPromptBody() {
  return (
    <ul className="space-y-3 text-sm text-muted-foreground">
      <li className="flex gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-attention" />
        <span>Real devices, real limits — demo actions don&apos;t persist.</span>
      </li>
      <li className="flex gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-attention" />
        <span>Keep browsing the demo after you dismiss this.</span>
      </li>
    </ul>
  );
}

export function DemoSignupPrompt() {
  const { signupPromptOpen, dismissSignupPrompt } = useDemo();
  const isDesktop = useIsDesktopMd();

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" onClick={dismissSignupPrompt}>
        Maybe later
      </Button>
      <Link
        href="/sign-up"
        className="inline-flex min-h-14 items-center justify-center rounded-lg bg-attention px-4 py-2.5 text-sm font-medium text-attention-foreground transition-colors hover:opacity-90 md:min-h-11"
      >
        Create free account
      </Link>
    </div>
  );

  if (isDesktop) {
    return (
      <Modal
        open={signupPromptOpen}
        onClose={dismissSignupPrompt}
        title="Like what you see?"
        description="Create a free account to protect your family for real — pairing, limits, and enforcement on Windows."
        className="w-[min(24rem,calc(100vw-2rem))]"
        footer={footer}
      >
        <SignupPromptBody />
      </Modal>
    );
  }

  return (
    <BottomSheet
      open={signupPromptOpen}
      onClose={dismissSignupPrompt}
      title="Like what you see?"
      description="Create a free account to protect your family for real."
      showDone={false}
      footer={footer}
    >
      <SignupPromptBody />
    </BottomSheet>
  );
}
