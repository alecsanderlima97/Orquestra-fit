"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { GoogleAuthProvider, browserLocalPersistence, createUserWithEmailAndPassword, getRedirectResult, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, updateProfile, User } from "firebase/auth";
import { Activity, BarChart3, CalendarDays, Dumbbell, Eye, EyeOff, LockKeyhole, LogIn, Mail, ShieldCheck, UserRound } from "lucide-react";
import { auth, isFirebaseConfigured } from "@/lib/firebase/client";
import { AcademyGate } from "./academy-gate";
import { AccessProvider } from "./access-context";

type AuthGateProps = { children: ReactNode };

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const [localLoggedOut, setLocalLoggedOut] = useState(false);

  useEffect(() => {
    if (isFirebaseConfigured) return;
    const handleLocalLogout = () => setLocalLoggedOut(true);
    window.addEventListener("orquestra-fit:local-logout", handleLocalLogout);
    return () => window.removeEventListener("orquestra-fit:local-logout", handleLocalLogout);
  }, []);

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

  if (!isFirebaseConfigured) {
    if (localLoggedOut) return <main className="auth-loading"><div><h1>Sessão encerrada</h1><p>O modo local está pronto para uma nova demonstração.</p><button className="detail-save" onClick={() => setLocalLoggedOut(false)}>Entrar no modo demonstração</button></div></main>;
    return <AccessProvider value={{ user: { uid: "local-demo", displayName: "Gestor", email: "gestor@orquestra.fit" } as User, userId: "local-demo", academyId: "local-academy", role: "admin", accountType: "developer" }}>{children}</AccessProvider>;
  }
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

function authenticationMessage(code?: string, creating = false) {
  if (code === "auth/network-request-failed") return "Sem conexão com o serviço de acesso. Verifique sua internet e tente novamente.";
  if (code === "auth/too-many-requests") return "Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar novamente.";
  if (code === "auth/user-disabled") return "Este acesso está bloqueado. Fale com a academia ou com o suporte.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "Login ou senha incorretos.";
  if (code === "auth/weak-password") return "A senha precisa ter pelo menos 6 caracteres.";
  if (code === "auth/email-already-in-use") return "Este acesso já existe. Entre com seus dados.";
  if (code === "auth/invalid-email") return "Informe um e-mail válido.";
  return creating
    ? "Não foi possível criar o acesso. Confira os dados e tente novamente."
    : "Não foi possível entrar. Confira seus dados de acesso.";
}

function LoginPanel({ initialStatus }: { initialStatus?: string | null }) {
  const [email, setEmail] = useState(() => window.localStorage.getItem("orquestra_fit_last_email") ?? "");
  const [username, setUsername] = useState(() => window.localStorage.getItem("orquestra_fit_last_username") ?? "");
  const [password, setPassword] = useState("");
  const [accessMode, setAccessMode] = useState<"email" | "username">("email");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState<string | null>(initialStatus ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      setStatus(authenticationMessage(code, mode === "signup"));
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
      if (code === "auth/popup-blocked") {
        setStatus("O navegador interno bloqueou a entrada. Abra este endereço no Safari ou Chrome e toque novamente em Continuar com Google.");
        return;
      }
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setStatus("A janela de entrada foi fechada antes da confirmação. Tente novamente.");
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
      <div className="auth-shell">
        <aside className="auth-visual" aria-label="Orquestra.cs, tecnologia para o esporte">
          <div className="auth-score" aria-hidden="true"><span /><span /><span /><span /></div>
          <header className="auth-platform-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/orquestra-cs-logo.png" alt="Orquestra.cs" />
            <div><small>ORQUESTRA.CS</small><strong>ORQUESTRA FIT</strong></div>
          </header>
          <div className="auth-visual-content">
            <div className="auth-fit-orbit" aria-hidden="true"><Dumbbell /></div>
            <span className="auth-visual-kicker"><i /> PLATAFORMA PARA ACADEMIAS</span>
            <h2>Toda a operação em movimento.</h2>
            <p>Treinos, evolução e gestão conectados em uma experiência feita para alunos, professores e gestores.</p>
          </div>
          <div className="auth-module-grid" aria-label="Recursos da plataforma">
            <span><Dumbbell /><b>Treinos</b><small>Prescrição e execução</small></span>
            <span><Activity /><b>Evolução</b><small>Histórico do aluno</small></span>
            <span><CalendarDays /><b>Agenda</b><small>Aulas e reservas</small></span>
            <span><BarChart3 /><b>Gestão</b><small>Operação integrada</small></span>
          </div>
        </aside>
        <section className="auth-form-side">
          <section className="auth-panel" aria-labelledby="login-title">
            <div className="auth-brand" aria-label="Orquestra Fit">
              <div className="auth-logo" aria-hidden="true"><Dumbbell /></div>
              <div><strong>ORQUESTRA FIT</strong><span>GESTÃO E PERFORMANCE</span></div>
            </div>
            <p className="auth-kicker"><ShieldCheck size={14} /> ACESSO PROTEGIDO</p>
            <h1 id="login-title">{mode === "signup" ? "Crie seu acesso" : "Bem-vindo de volta!"}</h1>
            <span>{mode === "signup" ? `Cadastre ${accessMode === "username" ? "usuário e senha" : "e-mail e senha"}. Em seguida, valide o código enviado pela academia.` : "Acesse sua conta e continue sua evolução."}</span>
            <form onSubmit={submit}>
              {accessMode === "email" ? <label><Mail size={17} /> E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" inputMode="email" placeholder="voce@exemplo.com" required /></label> : <label><UserRound size={17} /> Usuário<input value={username} onChange={(event) => setUsername(event.target.value.replace(/\s/g, "."))} autoComplete="username" placeholder="Ex.: maria.silva" required /></label>}
              <label><LockKeyhole size={17} /> Senha<div className="auth-password-wrap"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} placeholder="Mínimo de 6 caracteres" required /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
              {status && <p className="auth-status" role="status" aria-live="polite">{status}</p>}
              <button type="submit" disabled={submitting}><LogIn size={18} /> {submitting ? "Aguarde..." : mode === "signup" ? "Criar acesso" : "Entrar na plataforma"}</button>
            </form>
            {mode === "login" && <><div className="auth-divider"><span>ou continue com</span></div><button className="google-login" type="button" onClick={signInWithGoogle} disabled={submitting}><span>G</span> Continuar com Google</button>{accessMode === "email" && <button className="auth-link" type="button" onClick={resetPassword}>Esqueci minha senha?</button>}</>}
            <div className="auth-secondary-actions">
              <button className="auth-link" type="button" onClick={() => { setAccessMode((current) => current === "email" ? "username" : "email"); setMode("login"); setStatus(null); }}>{accessMode === "email" ? "Entrar com usuário da academia" : "Entrar com e-mail"}</button>
              <button className="auth-link" type="button" onClick={() => { setMode((current) => current === "login" ? "signup" : "login"); setStatus(null); }}>{mode === "signup" ? "Já tenho uma conta" : "Primeiro acesso"}</button>
            </div>
            <footer>Suporte: <a href="mailto:orquestracs@gmail.com">orquestracs@gmail.com</a></footer>
          </section>
        </section>
      </div>
    </main>
  );
}
