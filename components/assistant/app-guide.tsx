"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Pause, Sparkles, Volume2, X } from "lucide-react";
import { currentScreen, GUIDE_AUDIO, GUIDE_STORAGE_KEY, SCREEN_GUIDES, type ScreenGuide } from "@/lib/assistant/screen-guides";

type Role = "aluno" | "professor" | "gestao";
const orquestraAssistantIcon = "/branding/orquestra-assistant-icon.png";

const guides: Record<Role, { title: string; intro: string; steps: Array<[string, string]> }> = {
  aluno: {
    title: "Guia do aluno",
    intro: "Encontre seu treino, acompanhe a evolução e fale com a academia sem se perder.",
    steps: [
      ["Início", "Veja o treino publicado, avisos e situação da mensalidade."],
      ["Treinos", "Abra a ficha e inicie cada exercício quando estiver pronto."],
      ["Evolução", "Acompanhe cargas, séries concluídas e seus melhores resultados."],
      ["Perfil", "Atualize foto, senha e seus dados de acesso."],
    ],
  },
  professor: {
    title: "Guia do professor",
    intro: "Use os atalhos para acompanhar alunos e montar fichas com rapidez.",
    steps: [
      ["Alunos", "Selecione um aluno para abrir seus dados e ações."],
      ["Treinos", "Monte a ficha, revise os cards fechados e publique ao final."],
      ["Avaliações", "Registre medidas, observações e referências anatômicas."],
      ["Agenda", "Organize aulas, reservas e próximos atendimentos."],
    ],
  },
  gestao: {
    title: "Guia da gestão",
    intro: "Administre a operação, a equipe e os números da academia em um só lugar.",
    steps: [
      ["Cadastros", "Gerencie alunos, professores, vínculos e permissões."],
      ["Financeiro", "Controle mensalidades, despesas, notas e relatórios."],
      ["Configurações", "Publique comunicados e ajuste aparência e dados da academia."],
      ["Troca de área", "Use o seletor discreto para testar as experiências de professor e aluno."],
    ],
  },
};

function readSeen(): { screens: string[]; muted: boolean } {
  try { const value = JSON.parse(localStorage.getItem(GUIDE_STORAGE_KEY) ?? "{}"); return { screens: Array.isArray(value.screens) ? value.screens : [], muted: value.muted === true }; } catch { return { screens: [], muted: false }; }
}
function writeSeen(value: { screens: string[]; muted: boolean }) { try { localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(value)); } catch { /* armazenamento indisponível */ } }

/** Voz feminina pt-BR do aparelho, usada enquanto a tela não tem narração gravada. */
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices().filter((voice) => voice.lang.replace("_", "-").toLowerCase().startsWith("pt")) ?? [];
  const female = /francisca|thalita|luciana|vit[oó]ria|maria|leila|camila|fernanda|female|feminin|google portugu[eê]s do brasil/i;
  return voices.find((voice) => /pt-br/i.test(voice.lang.replace("_", "-")) && female.test(voice.name))
    ?? voices.find((voice) => female.test(voice.name))
    ?? voices.find((voice) => /pt-br/i.test(voice.lang.replace("_", "-")))
    ?? voices[0];
}

/** Dica falada da tela atual: abre sozinha na primeira visita e pode ser ouvida de novo pelo botão da assistente. */
function ScreenTip({ guide, autoPlay, onClose, onMute }: { guide: ScreenGuide; autoPlay: boolean; onClose: () => void; onMute: () => void }) {
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useCallback(() => { audio.current?.pause(); audio.current = null; window.speechSynthesis?.cancel(); setSpeaking(false); }, []);
  const play = useCallback(() => {
    stop();
    if (GUIDE_AUDIO.has(guide.id)) {
      const element = new Audio(`/assistant/${guide.id}.mp3`); audio.current = element;
      element.onended = () => setSpeaking(false);
      element.play().then(() => setSpeaking(true)).catch(() => setSpeaking(false));
      return;
    }
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(guide.text);
    utterance.lang = "pt-BR"; utterance.rate = 1.02; utterance.pitch = 1.05;
    const voice = pickVoice(); if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true); utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [guide, stop]);
  useEffect(() => {
    if (!autoPlay) return stop;
    const timer = window.setTimeout(play, 350);
    return () => { window.clearTimeout(timer); stop(); };
  }, [autoPlay, play, stop]);
  return <div className="app-guide is-presenting">
    <section className="app-guide-panel" role="dialog" aria-label={`Assistente: ${guide.title}`} aria-live="polite">
      <header><span><img className="orquestra-guide-icon" src={orquestraAssistantIcon} alt="" /><small>ASSISTENTE ORQUESTRA</small></span><button aria-label="Fechar dica" onClick={() => { stop(); onClose(); }}><X /></button></header>
      <div className="app-guide-copy"><em>Dica desta tela</em><h2>{guide.title}</h2><p>{guide.text}</p></div>
      <footer><button className="guide-mute" onClick={() => { stop(); onMute(); }}>Não mostrar dicas</button><span className="app-guide-actions"><button className="guide-secondary" aria-label={speaking ? "Pausar narração" : "Ouvir narração"} onClick={speaking ? stop : play}>{speaking ? <Pause /> : <Volume2 />}</button><button onClick={() => { stop(); onClose(); }}>Entendi <Sparkles /></button></span></footer>
    </section>
  </div>;
}

export function AppGuide({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const guide = guides[role];
  const [screen, setScreen] = useState<{ guide: ScreenGuide; autoPlay: boolean; open: boolean } | null>(null);

  useEffect(() => {
    function onScreen(event: Event) {
      const detail = (event as CustomEvent<{ role?: Role; screen?: string }>).detail;
      if (!detail?.role || detail.role !== role || !detail.screen) return;
      const next = SCREEN_GUIDES[detail.role]?.[detail.screen];
      if (!next) { setScreen(null); return; }
      const seen = readSeen(); const firstVisit = !seen.muted && !seen.screens.includes(`${role}:${next.id}`);
      setScreen({ guide: next, autoPlay: firstVisit, open: firstVisit });
    }
    window.addEventListener("orquestra-fit:screen", onScreen);
    const initial = currentScreen(); if (initial) onScreen(new CustomEvent("orquestra-fit:screen", { detail: initial }));
    return () => window.removeEventListener("orquestra-fit:screen", onScreen);
  }, [role]);

  const markSeen = (muted = false) => {
    if (!screen) return; const seen = readSeen();
    writeSeen({ screens: [...new Set([...seen.screens, `${role}:${screen.guide.id}`])], muted: seen.muted || muted });
    setScreen({ ...screen, open: false, autoPlay: false });
  };

  useEffect(() => {
    function showContextualGuide(event: Event) {
      const requestedStep = (event as CustomEvent<{ step?: number }>).detail?.step ?? 0;
      setStep(Math.max(0, Math.min(requestedStep, guide.steps.length - 1)));
      setOpen(true);
    }
    window.addEventListener("orquestra-fit:assistant-info", showContextualGuide);
    return () => window.removeEventListener("orquestra-fit:assistant-info", showContextualGuide);
  }, [guide.steps.length]);

  function close() {
    localStorage.setItem(`orquestra-fit:guide-seen:${role}`, "true");
    setOpen(false);
    setStep(0);
  }

  if (screen?.open) return <ScreenTip key={screen.guide.id} guide={screen.guide} autoPlay={screen.autoPlay} onClose={() => markSeen()} onMute={() => markSeen(true)} />;
  if (!open) return screen ? <div className="app-guide"><button className="app-guide-trigger" aria-label={`Ouvir a assistente sobre ${screen.guide.title}`} title="Assistente" onClick={() => setScreen({ ...screen, open: true, autoPlay: true })}><img className="orquestra-guide-icon" src={orquestraAssistantIcon} alt="" /></button></div> : null;

  return <div className="app-guide is-presenting">
    <section className="app-guide-panel" role="dialog" aria-label={guide.title}>
      <header><span><img className="orquestra-guide-icon" src={orquestraAssistantIcon} alt="" /><small>ASSISTENTE ORQUESTRA</small></span><button aria-label="Fechar guia" onClick={close}><X /></button></header>
      <div className="app-guide-copy"><em>{guide.title} · {step + 1} de {guide.steps.length}</em><h2>{guide.steps[step][0]}</h2><p>{guide.steps[step][1]}</p>{step === 0 && <small>{guide.intro}</small>}</div>
      <div className="app-guide-dots">{guide.steps.map((item, index) => <button key={item[0]} aria-label={`Ir para ${item[0]}`} className={step === index ? "active" : ""} onClick={() => setStep(index)} />)}</div>
      <footer>{step > 0 ? <button className="guide-secondary" onClick={() => setStep(step - 1)}>Voltar</button> : <span />}{step < guide.steps.length - 1 ? <button onClick={() => setStep(step + 1)}>Próximo <ChevronRight /></button> : <button onClick={close}>Concluir <Sparkles /></button>}</footer>
    </section>
  </div>;
}
