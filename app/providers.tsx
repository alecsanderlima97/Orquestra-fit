"use client";

import { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { usePathname } from "next/navigation";
import { KioskShell } from "@/components/kiosk/kiosk-shell";

export function Providers({ children }: { children: ReactNode }) {
  const kiosk = usePathname() === "/quiosque";
  if (kiosk) return <KioskShell><AuthGate kiosk>{children}</AuthGate></KioskShell>;
  return (
    <>
      <AuthGate>{children}</AuthGate>
      <PwaInstallPrompt />
    </>
  );
}
