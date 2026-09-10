"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { collection, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firebase/client";
import type { User } from "firebase/auth";

type AcademyGateProps = { user: User; children: ReactNode };

type UserProfile = {
  activeAcademyId: string;
  accountType?: "developer" | "academy_admin";
};

function isDeveloperAccount(user: User) {
  const developerEmail = process.env.NEXT_PUBLIC_DEVELOPER_EMAIL?.trim().toLowerCase();
  return Boolean(developerEmail && user.email?.trim().toLowerCase() === developerEmail);
}

export function AcademyGate({ user, children }: AcademyGateProps) {
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);

  useEffect(() => {
    if (!db) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setProfile(null);
    }, 8000);

    getDoc(doc(db, "users", user.uid))
      .then((snapshot) => setProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null))
      .catch(() => setProfile(null));

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [user.uid]);

  if (profile === undefined) return <main className="auth-loading">Preparando seu acesso...</main>;
  if (!profile?.activeAcademyId) return <CreateAcademy user={user} onCreated={setProfile} />;

  return <>{children}</>;
}

function CreateAcademy({ user, onCreated }: { user: User; onCreated: (profile: UserProfile) => void }) {
  const developer = isDeveloperAccount(user);
  const [academyName, setAcademyName] = useState(developer ? "Orquestra Fit - Ambiente de Testes" : "");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !academyName.trim()) return;
    setSubmitting(true);
    setStatus(null);

    try {
      const academyRef = doc(collection(db, "academies"));
      const memberRef = doc(db, "academies", academyRef.id, "members", user.uid);
      const userRef = doc(db, "users", user.uid);
      const batch = writeBatch(db);
      const now = serverTimestamp();

      batch.set(academyRef, {
        name: academyName.trim(),
        ownerId: user.uid,
        accountType: developer ? "developer" : "academy_admin",
        environment: developer ? "test" : "production",
        demoData: developer,
        plan: "basic",
        status: "active",
        createdAt: now,
      });
      batch.set(memberRef, {
        userId: user.uid,
        displayName: user.displayName ?? user.email ?? "Administrador",
        email: user.email ?? null,
        role: "admin",
        active: true,
        createdAt: now,
      });
      batch.set(userRef, {
        displayName: user.displayName ?? user.email ?? "Administrador",
        email: user.email ?? null,
        accountType: developer ? "developer" : "academy_admin",
        activeAcademyId: academyRef.id,
        academyIds: [academyRef.id],
        createdAt: now,
      });
      await batch.commit();
      onCreated({ activeAcademyId: academyRef.id, accountType: developer ? "developer" : "academy_admin" });
    } catch {
      setStatus("Não foi possível criar a academia. Confirme se as regras do Firestore foram publicadas.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel academy-onboarding" aria-labelledby="academy-title">
        <div className="auth-mark"><Building2 size={28} /></div>
        <p>ORQUESTRA FIT</p>
        <h1 id="academy-title">Vamos preparar seu ambiente</h1>
        <span>{developer ? "Este é um ambiente interno de testes. Não use dados reais de clientes aqui." : "Este primeiro acesso será o administrador da sua academia e poderá cadastrar equipe, alunos e planos."}</span>
        <form onSubmit={submit}>
          <label><ShieldCheck size={17} /> Nome da academia<input value={academyName} onChange={(event) => setAcademyName(event.target.value)} autoComplete="organization" required /></label>
          {status && <p className="auth-status" role="status">{status}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Criando..." : "Criar academia"}</button>
        </form>
        <p className="onboarding-note"><CheckCircle2 size={16} /> Os dados ficarão isolados nesta academia.</p>
      </section>
    </main>
  );
}
