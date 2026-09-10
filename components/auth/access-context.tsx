"use client";

import { createContext, ReactNode, useContext } from "react";
import type { User } from "firebase/auth";

export type AccessRole = "admin" | "teacher" | "student";

export type AccessProfile = {
  user: User;
  userId: string;
  academyId: string;
  role: AccessRole;
  accountType?: "developer" | "academy_admin";
};

const AccessContext = createContext<AccessProfile | null>(null);

export function AccessProvider({ value, children }: { value: AccessProfile; children: ReactNode }) {
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess precisa estar dentro de AccessProvider");
  return value;
}
