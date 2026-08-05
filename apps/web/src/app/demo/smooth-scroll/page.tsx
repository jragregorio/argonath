import type { Metadata } from "next";
import { DemoOne } from "@/components/ui/smooth-scroll-demo";

export const metadata: Metadata = {
  title: "Smooth scroll demo — Warden",
  robots: { index: false, follow: false },
};

/** Local/dev preview of the Lenis sticky smooth-scroll component. */
export default function SmoothScrollDemoPage() {
  return <DemoOne />;
}
