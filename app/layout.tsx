/** Owner: nova (fonts/body classes coordinated with lumen). */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Climb Tracker", template: "%s · Climb Tracker" },
  description: "Sigue tu progreso en SoloQ de Bronce a Platino.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
