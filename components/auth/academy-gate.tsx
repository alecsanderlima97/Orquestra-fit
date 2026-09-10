"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { collection, doc, getDoc, getDocFromServer, serverTimestamp, writeBatch } from "firebase/firestore";
import { Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import { AccessProvider, AccessRole } from "./access-context";

type AcademyGateProps = { user: User; children: ReactNode };

type UserProfile = {
  activeAcademyId: string;
  accountType?: "developer" | "academy_admin";
};

type MemberProfile = {
  role?: AccessRole;
  active?: boolean;
};

function isDeveloperAccount(user: User) {
  const developerEmail = process.env.NEXT_PUBLIC_DEVELOPER_EMAIL?.trim().toLowerCase();
  return Boolean(developerEmail && user.email?.trim().toLowerCase() === developerEmail);
}

export function AcademyGate({ user, children }: AcademyGateProps) {
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [member, setMember] = useState<MemberProfile | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!db) {
      setProfile(null);
      return;
    }
    const firestore = db;

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setProfile(null);
        setMember(null);
      }
    }, 8000);

    getDocFromServer(doc(firestore, "users", user.uid))
      .then(async (snapshot) => {
        if (cancelled) return;
        if (!snapshot.exists()) {
          window.clearTimeout(timeoutId);
          setProfile(null);
          setMember(null);
          return;
        }
        const nextProfile = snapshot.data() as UserProfile;
        setProfile(nextProfile);
        const memberSnapshot = await getDocFromServer(doc(firestore, "academies", nextProfile.activeAcademyId, "members", user.uid));
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        setMember(memberSnapshot.exists() ? (memberSnapshot.data() as MemberProfile) : null);
      })
      .catch(() => {
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [user.uid]);

  if (loadError) return <main className="auth-loading">Não foi possível confirmar seu acesso agora. Atualize a página para tentar novamente.</main>;
  if (profile === undefined || member === undefined) return <main className="auth-loading">Preparando seu acesso...</main>;
  if (!profile?.activeAcademyId) {
    return isDeveloperAccount(user)
      ? <CreateAcademy user={user} onCreated={(nextProfile) => { setProfile(nextProfile); setMember({ role: "admin", active: true }); }} />
      : <ActivateAccess user={user} onActivated={(nextProfile, nextMember) => { setProfile(nextProfile); setMember(nextMember); }} />;
  }
  if (!member?.active || !member.role) return <main className="auth-loading">Seu acesso ainda não foi liberado pela academia.</main>;

  return (
    <AccessProvider
      value={{
        user,
        userId: user.uid,
        academyId: profile.activeAcademyId,
        role: member.role,
        accountType: profile.accountType,
      }}
    >
      {children}
    </AccessProvider>
  );
}

function ActivateAccess({ user, onActivated }: { user: User; onActivated: (profile: UserProfile, member: MemberProfile) => void }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !code.trim()) return;
    setSubmitting(true);
    setStatus(null);
    const firestore = db;
    const normalizedCode = code.trim().toUpperCase();

    try {
      const codeRef = doc(firestore, "accessCodes", normalizedCode);
      const codeSnapshot = await getDoc(codeRef);
      if (!codeSnapshot.exists() || codeSnapshot.data().active !== true) {
        setStatus("Esse código é inválido, expirou ou já foi utilizado.");
        return;
      }

      const invitation = codeSnapshot.data() as { academyId: string; role: "admin" | "teacher" | "student" };
      const memberRef = doc(firestore, "academies", invitation.academyId, "members", user.uid);
      const userRef = doc(firestore, "users", user.uid);
      const batch = writeBatch(firestore);
      const now = serverTimestamp();

      batch.update(codeRef, { active: false, claimedBy: user.uid, claimedAt: now });
      batch.set(memberRef, {
        userId: user.uid,
        displayName: user.displayName ?? user.email ?? "Usuário",
        email: user.email ?? null,
        role: invitation.role,
        active: true,
        activationCodeId: normalizedCode,
        createdAt: now,
      });
      const userData = {
        displayName: user.displayName ?? user.email ?? "Usuário",
        email: user.email ?? null,
        activeAcademyId: invitation.academyId,
        academyIds: [invitation.academyId],
        activationCodeId: normalizedCode,
        createdAt: now,
        ...(invitation.role === "admin" ? { accountType: "academy_admin" as const } : {}),
      };
      batch.set(userRef, userData, { merge: true });
      await batch.commit();
      onActivated(
        { activeAcademyId: invitation.academyId, accountType: invitation.role === "admin" ? "academy_admin" : undefined },
        { role: invitation.role, active: true },
      );
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      setStatus(errorCode ? `Não foi possível ativar este acesso (${errorCode}).` : "Não foi possível ativar este acesso. Confira o código ou tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel academy-onboarding" aria-labelledby="activation-title">
        <div className="auth-mark"><ShieldCheck size={28} /></div>
        <p>ORQUESTRA FIT</p>
        <h1 id="activation-title">Ative seu acesso</h1>
        <span>Entre com sua conta Google e informe o código recebido da academia para liberar seu perfil.</span>
        <form onSubmit={submit}>
          <label><ShieldCheck size={17} /> Código de ativação<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} autoComplete="one-time-code" placeholder="Ex.: DF-7K4M2P" required /></label>
          {status && <p className="auth-status" role="status">{status}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Ativando..." : "Ativar acesso"}</button>
        </form>
        <p className="onboarding-note"><CheckCircle2 size={16} /> Este código só pode ser usado uma vez.</p>
        <button className="auth-link" type="button" onClick={() => auth && signOut(auth)}>Voltar para entrada</button>
      </section>
    </main>
  );
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
