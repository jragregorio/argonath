import type { Metadata } from "next";
import { TRPCProvider } from "@/lib/trpc-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warden — Parental Screen Time Control",
  description: "Monitor and manage your child's screen time",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
