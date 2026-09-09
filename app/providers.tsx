"use client";

import { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";

export function Providers({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
