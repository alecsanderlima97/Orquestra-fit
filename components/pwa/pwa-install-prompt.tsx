"use client";

import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios] = useState(() => typeof window !== "undefined" && isIosDevice());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }

    if (isStandalone()) return;

    const dismissed = window.localStorage.getItem("orquestra-fit-pwa-dismissed") === "1";
    if (dismissed) return;

    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleInstall);
    const revealTimer = ios ? window.setTimeout(() => setVisible(true), 0) : undefined;

    return () => {
      if (revealTimer) window.clearTimeout(revealTimer);
      window.removeEventListener("beforeinstallprompt", handleInstall);
    };
  }, [ios]);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem("orquestra-fit-pwa-dismissed", "1");
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    setVisible(false);
  };

  return (
    <aside className="pwa-install-prompt" aria-live="polite">
      <button className="pwa-install-dismiss" type="button" onClick={dismiss} aria-label="Fechar aviso">
        <X size={16} />
      </button>
      <div className="pwa-install-icon" aria-hidden="true">
        <Download size={19} />
      </div>
      <div className="pwa-install-copy">
        <strong>Leve o Orquestra Fit com você</strong>
        {ios ? (
          <span><Share2 size={13} /> Toque em Compartilhar e depois em “Adicionar à Tela de Início”.</span>
        ) : (
          <span>Instale no celular para abrir mais rápido, como um aplicativo.</span>
        )}
      </div>
      {!ios && installEvent && (
        <button className="pwa-install-action" type="button" onClick={() => void install()}>
          Instalar
        </button>
      )}
    </aside>
  );
}
