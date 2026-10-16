"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "firebase/auth";
import { LogOut } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { KIOSK_WARNING_MS, kioskRemainingSeconds } from "@/lib/kiosk-session";

export function KioskSession({ children }: { children: ReactNode }) {
  const lastActivity = useRef(Date.now());
  const closing = useRef(false);
  const [remaining, setRemaining] = useState(120);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(false);
  const leave = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    setLocked(true);
    setError(false);
    try {
      if (auth) await signOut(auth);
    } catch {
      setError(true);
      closing.current = false;
    }
  }, []);
  useEffect(() => {
    const check = () => {
      const seconds = kioskRemainingSeconds(lastActivity.current, Date.now());
      setRemaining(seconds);
      if (!seconds) void leave();
    };
    const activity = () => {
      // An event after the deadline must not silently revive an abandoned session.
      if (kioskRemainingSeconds(lastActivity.current, Date.now()) === 0) { void leave(); return; }
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => document.addEventListener(event, activity, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const interval = window.setInterval(check, 1000);
    return () => {
      window.clearInterval(interval);
      events.forEach((event) => document.removeEventListener(event, activity, true));
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [leave]);
  if (locked) return <section className="kiosk-session" role="status"><h1>Encerrando seu acesso…</h1>{error && <><p>Não foi possível sair. Tente novamente antes de deixar o computador.</p><button onClick={() => void leave()}>Tentar sair novamente</button></>}</section>;
  return <>
    <div className="kiosk-session-bar"><span>Acesso temporário · encerra após 2 min sem uso</span><button type="button" onClick={() => void leave()}><LogOut size={18} />Sair da minha conta</button></div>
    {remaining <= KIOSK_WARNING_MS / 1000 && <div className="kiosk-idle-warning" role="alert"><span>Sua conta será fechada em {remaining}s por inatividade.</span><button onClick={() => { lastActivity.current = Date.now(); setRemaining(120); }}>Continuar aqui</button></div>}
    {children}
  </>;
}
