"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { GoogleAuthProvider, browserLocalPersistence, createUserWithEmailAndPassword, getRedirectResult, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, User } from "firebase/auth";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { auth, isFirebaseConfigured } from "@/lib/firebase/client";
import { AcademyGate } from "./academy-gate";

type AuthGateProps = { children: ReactNode };

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    const firebaseAuth = auth;
    let mounted = true;
    let redirectChecked = false;
    void setPersistence(firebaseAuth, browserLocalPersistence);
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      if (!mounted) return;
      setUser(nextUser);
      if (nextUser || redirectChecked) setLoading(false);
    });
    getRedirectResult(firebaseAuth)
      .then((result) => {
        if (!mounted) return;
        if (result?.user) {
          setUser(result.user);
        }
      })
      .catch((error) => {
        if (!mounted) return;
        console.error("Não foi possível concluir o retorno do Google.", error);
        const code = (error as { code?: string }).code;
        setRedirectError(code === "auth/unauthorized-domain"
          ? "Este endereço ainda não foi autorizado no Firebase. Adicione localhost aos domínios autorizados."
          : "O Google não conseguiu concluir o acesso. Tente novamente.");
      })
      .finally(() => {
        if (mounted) {
          redirectChecked = true;
          if (!firebaseAuth.currentUser) setLoading(false);
        }
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!isFirebaseConfigured) return <>{children}</>;
  if (loading) return <main className="auth-loading">Carregando acesso seguro...</main>;
  if (!user) return <LoginPanel initialStatus={redirectError} />;

  return <AcademyGate user={user}>{children}</AcademyGate>;
}

function LoginPanel({ initialStatus }: { initialStatus?: string | null }) {
  const [email, setEmail] = useState(() => window.localStorage.getItem("orquestra_fit_last_email") ?? "");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState<string | null>(initialStatus ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setSubmitting(true);
    setStatus(null);
    try {
      window.localStorage.setItem("orquestra_fit_last_email", email.trim());
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      setStatus(mode === "signup"
        ? code === "auth/email-already-in-use" ? "Este e-mail já possui acesso. Entre com sua senha." : "Não foi possível criar o acesso. Use um e-mail válido e uma senha com pelo menos 6 caracteres."
        : "Não foi possível entrar. Confira seu e-mail e senha.");
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
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        await signInWithRedirect(auth, provider);
        return;
      }
      setStatus(code === "auth/unauthorized-domain"
        ? "Este endereço não está autorizado no Firebase. Confirme localhost e orquestra-fit.vercel.app nos domínios autorizados."
        : `Não foi possível entrar com o Google${code ? ` (${code})` : ""}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="auth-mark"><ShieldCheck size={28} /></div>
        <p>ORQUESTRA FIT</p>
        <h1 id="login-title">{mode === "signup" ? "Criar acesso" : "Acesso ao Orquestra Fit"}</h1>
        <span>{mode === "signup" ? "Crie seu acesso com e-mail e senha. Depois, informe o código recebido da academia." : "Use seu e-mail e senha ou entre com sua conta Google."}</span>
        <form onSubmit={submit}>
          <label><Mail size={17} /> E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label><LockKeyhole size={17} /> Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>
          {status && <p className="auth-status" role="status">{status}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Aguarde..." : mode === "signup" ? "Criar acesso" : "Entrar"}</button>
        </form>
        {mode === "login" && <><div className="auth-divider"><span>ou</span></div><button className="google-login" type="button" onClick={signInWithGoogle} disabled={submitting}><span>G</span> Continuar com Google</button><button className="auth-link" type="button" onClick={resetPassword}>Esqueci minha senha</button></>}
        <button className="auth-link" type="button" onClick={() => { setMode((current) => current === "login" ? "signup" : "login"); setStatus(null); }}>{mode === "signup" ? "Já tenho uma conta" : "Criar acesso sem Google"}</button>
      </section>
    </main>
  );
}
