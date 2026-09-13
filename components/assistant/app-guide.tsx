"use client";

import { useEffect, useState } from "react";
import { Bot, ChevronRight, HelpCircle, Sparkles, X } from "lucide-react";

type Role = "aluno" | "professor" | "gestao";

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

export function AppGuide({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const guide = guides[role];

  useEffect(() => {
    const key = `orquestra-fit:guide-seen:${role}`;
    if (!localStorage.getItem(key)) setOpen(true);
  }, [role]);

  function close() {
    localStorage.setItem(`orquestra-fit:guide-seen:${role}`, "true");
    setOpen(false);
    setStep(0);
  }

  return <div className="app-guide">
    {open && <section className="app-guide-panel" role="dialog" aria-label={guide.title}>
      <header><span><Bot /><small>ASSISTENTE ORQUESTRA</small></span><button aria-label="Fechar guia" onClick={close}><X /></button></header>
      <div className="app-guide-copy"><em>{guide.title} · {step + 1} de {guide.steps.length}</em><h2>{guide.steps[step][0]}</h2><p>{guide.steps[step][1]}</p>{step === 0 && <small>{guide.intro}</small>}</div>
      <div className="app-guide-dots">{guide.steps.map((item, index) => <button key={item[0]} aria-label={`Ir para ${item[0]}`} className={step === index ? "active" : ""} onClick={() => setStep(index)} />)}</div>
      <footer>{step > 0 ? <button className="guide-secondary" onClick={() => setStep(step - 1)}>Voltar</button> : <span />}{step < guide.steps.length - 1 ? <button onClick={() => setStep(step + 1)}>Próximo <ChevronRight /></button> : <button onClick={close}>Concluir <Sparkles /></button>}</footer>
    </section>}
    <button className="app-guide-trigger" aria-label="Abrir guia do sistema" title="Ajuda" onClick={() => setOpen((current) => !current)}>{open ? <X /> : <HelpCircle />}</button>
  </div>;
}
