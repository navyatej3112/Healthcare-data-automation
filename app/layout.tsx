import type { Metadata } from "next";
import "./globals.css";

// Note: we intentionally avoid `next/font/google`. It fetches font files from
// Google at build/compile time, which makes the build depend on outbound network
// access. A system-font stack (see globals.css) keeps `next build` hermetic and
// fast, with no external dependency — appropriate for an internal report tool.

export const metadata: Metadata = {
  title: "Facility Assessment Snapshot",
  description:
    "INFINITE — Managed by MEDELITE. Facility assessment report generator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
