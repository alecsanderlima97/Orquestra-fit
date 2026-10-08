"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Maximize, Smartphone, ShieldCheck } from "lucide-react";
import "./kiosk.css";

export const KIOSK_APP_URL = "https://fit.orquestracs.com/";

export function KioskShell({ children }: { children: ReactNode }) {
  const [qr, setQr] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void import("qrcode").then((module) => module.default.toDataURL(KIOSK_APP_URL, {
      width: 320, margin: 4, errorCorrectionLevel: "M", color: { dark: "#10191e", light: "#ffffff" },
    })).then((url) => { if (active) setQr(url); }).catch(() => { if (active) setNotice("Abra o endereço abaixo no seu celular."); });
    return () => { active = false; };
  }, []);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setNotice("Use F11 no computador para ativar a tela cheia."); }
  }
  return <div className="kiosk-shell">
    <header className="kiosk-header">
      <div className="kiosk-brand"><img src="/dama-de-ferro.jpeg" alt="Dama de Ferro Academia" width={64} height={64} /><div><strong>DAMA DE FERRO</strong><span>QUIOSQUE DE TREINOS</span></div></div>
      <button type="button" onClick={() => void fullscreen()}><Maximize size={18} />Tela cheia</button>
    </header>
    <div className="kiosk-layout">
      <div className="kiosk-main">{children}</div>
      <aside className="kiosk-install" aria-labelledby="kiosk-install-title">
        <span className="kiosk-eyebrow"><Smartphone size={18} />SEU TREINO NO CELULAR</span>
        <h2 id="kiosk-install-title">Leve sua evolução<br />com você.</h2>
        <p>Aponte a câmera para o QR code e abra o aplicativo.</p>
        <div className="kiosk-qr">{qr ? <img src={qr} alt="QR code para abrir o Orquestra Fit no celular" width={256} height={256} /> : <span role="status">Preparando QR code…</span>}</div>
        <p className="kiosk-app-address">{KIOSK_APP_URL.replace("https://", "").replace(/\/$/, "")}</p>
        <ol><li><strong>Abra no celular</strong><span>Use a câmera ou um leitor de QR code.</span></li><li><strong>Adicione à tela inicial</strong><span>Android: menu do navegador → Instalar aplicativo ou Adicionar à tela inicial.</span><span>iPhone: Safari → Compartilhar → Adicionar à Tela de Início.</span></li><li><strong>Entre com sua conta</strong><span>Use o acesso liberado pela academia.</span></li></ol>
        {notice && <p role="status">{notice}</p>}
      </aside>
    </div>
    <footer className="kiosk-footer"><span><ShieldCheck size={17} />Computador compartilhado · saia da conta ao terminar.</span><span className="kiosk-brand-signature"><img src="/branding/orquestra-cs/symbol-o.png" alt="" width={34} height={34} /><span className="kiosk-brand-signature-copy"><small>Sistema de treinos</small><strong>Orquestra Fit</strong><em>Desenvolvido por Orquestra.cs</em></span></span></footer>
  </div>;
}
