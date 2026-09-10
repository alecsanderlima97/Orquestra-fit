"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithRedirect, User } from "firebase/auth";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { auth, isFirebaseConfigured } from "@/lib/firebase/client";
import { AcademyGate } from "./academy-gate";

type AuthGateProps = { children: ReactNode };

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  if (!isFirebaseConfigured) return <>{children}</>;
  if (loading) return <main className="auth-loading">Carregando acesso seguro...</main>;
  if (!user) return <LoginPanel />;

  return <AcademyGate user={user}>{children}</AcademyGate>;
}

function LoginPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setSubmitting(true);
    setStatus(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setStatus("Não foi possível entrar. Confira seu e-mail e código de acesso.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword() {
    if (!auth || !email.trim()) {
      setStatus("Informe seu e-mail para receber a redefinição de senha.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus("Enviamos as instruções de redefinição para seu e-mail.");
    } catch {
      setStatus("Não foi possível enviar a redefinição agora.");
    }
  }

  async function signInWithGoogle() {
    if (!auth) return;
    setSubmitting(true);
    setStatus(null);
    try {
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } catch {
      setStatus("Não foi possível entrar com o Google agora.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="auth-mark"><ShieldCheck size={28} /></div>
        <p>ORQUESTRA FIT</p>
        <h1 id="login-title">Acesso ao Orquestra Fit</h1>
        <span>Use seu e-mail cadastrado e o código de acesso fornecido pela academia.</span>
        <form onSubmit={submit}>
          <label><Mail size={17} /> E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label><LockKeyhole size={17} /> Código de acesso<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {status && <p className="auth-status" role="status">{status}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Entrando..." : "Entrar"}</button>
        </form>
        <div className="auth-divider"><span>ou</span></div>
        <button className="google-login" type="button" onClick={signInWithGoogle} disabled={submitting}><span>G</span> Continuar com Google</button>
        <button className="auth-link" type="button" onClick={resetPassword}>Solicitar novo código</button>
      </section>
    </main>
  );
}
