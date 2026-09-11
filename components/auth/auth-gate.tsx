"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { GoogleAuthProvider, browserLocalPersistence, createUserWithEmailAndPassword, getRedirectResult, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, updateProfile, User } from "firebase/auth";
import { LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
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

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ".");
}

function usernameAuthEmail(username: string) {
  return `${normalizeUsername(username)}@accounts.orquestra-fit.local`;
}

function LoginPanel({ initialStatus }: { initialStatus?: string | null }) {
  const [email, setEmail] = useState(() => window.localStorage.getItem("orquestra_fit_last_email") ?? "");
  const [username, setUsername] = useState(() => window.localStorage.getItem("orquestra_fit_last_username") ?? "");
  const [password, setPassword] = useState("");
  const [accessMode, setAccessMode] = useState<"email" | "username">("email");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState<string | null>(initialStatus ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setSubmitting(true);
    setStatus(null);
    try {
      if (accessMode === "username") {
        const normalizedUsername = normalizeUsername(username);
        if (!/^[a-z0-9][a-z0-9._-]{2,30}$/.test(normalizedUsername)) {
          setStatus("Use um nome de usuário com 3 a 31 caracteres, sem acentos ou espaços.");
          return;
        }
        window.localStorage.setItem("orquestra_fit_last_username", normalizedUsername);
        if (mode === "signup") {
          const credential = await createUserWithEmailAndPassword(auth, usernameAuthEmail(normalizedUsername), password);
          await updateProfile(credential.user, { displayName: normalizedUsername });
        } else {
          await signInWithEmailAndPassword(auth, usernameAuthEmail(normalizedUsername), password);
        }
      } else {
        window.localStorage.setItem("orquestra_fit_last_email", email.trim());
        if (mode === "signup") await createUserWithEmailAndPassword(auth, email.trim(), password);
        else await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      setStatus(mode === "signup"
        ? code === "auth/email-already-in-use" ? "Este acesso já existe. Entre com seus dados." : "Não foi possível criar o acesso. Confira os dados e use uma senha com pelo menos 6 caracteres."
        : "Não foi possível entrar. Confira seus dados de acesso.");
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
        <span>{mode === "signup" ? `Crie seu acesso com ${accessMode === "username" ? "nome de usuário e senha" : "e-mail e senha"}. Depois, informe o código recebido da academia.` : "Use seu e-mail, nome de usuário ou entre com sua conta Google."}</span>
        <form onSubmit={submit}>
          {accessMode === "email" ? <label><Mail size={17} /> E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label> : <label><UserRound size={17} /> Nome de usuário<input value={username} onChange={(event) => setUsername(event.target.value.replace(/\s/g, "."))} autoComplete="username" placeholder="Ex.: maria.silva" required /></label>}
          <label><LockKeyhole size={17} /> Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>
          {status && <p className="auth-status" role="status">{status}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Aguarde..." : mode === "signup" ? "Criar acesso" : "Entrar"}</button>
        </form>
        {mode === "login" && <><div className="auth-divider"><span>ou</span></div><button className="google-login" type="button" onClick={signInWithGoogle} disabled={submitting}><span>G</span> Continuar com Google</button>{accessMode === "email" && <button className="auth-link" type="button" onClick={resetPassword}>Esqueci minha senha</button>}</>}
        <button className="auth-link" type="button" onClick={() => { setAccessMode((current) => current === "email" ? "username" : "email"); setMode("login"); setStatus(null); }}>{accessMode === "email" ? "Entrar com nome de usuário" : "Entrar com e-mail"}</button>
        <button className="auth-link" type="button" onClick={() => { setMode((current) => current === "login" ? "signup" : "login"); setStatus(null); }}>{mode === "signup" ? "Já tenho uma conta" : accessMode === "username" ? "Criar acesso com nome de usuário" : "Criar acesso com e-mail"}</button>
      </section>
    </main>
  );
}
