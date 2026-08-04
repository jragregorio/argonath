import type { Metadata, Viewport } from "next";
import { Outfit, Source_Sans_3 } from "next/font/google";
import { NativePushBootstrap } from "@/components/native-push-bootstrap";
import { TRPCProvider } from "@/lib/trpc-provider";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Warden — Parental Screen Time Control",
  description:
    "Set daily limits, approve extension requests, and enforce screen time on your child's Windows PC from one parent dashboard.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a2420",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${sourceSans.variable}`}>
      <body>
        <NativePushBootstrap />
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
