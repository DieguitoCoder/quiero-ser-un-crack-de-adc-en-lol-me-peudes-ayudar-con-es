/** Owner: nova (fonts/body classes coordinated with lumen). */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Climb Tracker", template: "%s · Climb Tracker" },
  description: "Sigue tu progreso en League of Legends: rango, partidas, coach y metas.",
};

async function isSignedIn(): Promise<boolean> {
  try {
    return (await getCurrentUser()) !== null;
  } catch {
    return false;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const signedIn = await isSignedIn();
  return (
    <html lang="es">
      <body>
        <AppShell signedIn={signedIn}>{children}</AppShell>
      </body>
    </html>
  );
}
