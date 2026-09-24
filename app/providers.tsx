"use client";

import { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthGate>{children}</AuthGate>
      <PwaInstallPrompt />
    </>
  );
}
