"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Activity, ArrowLeft, ArrowRight, Banknote, BarChart3, Bell, CalendarDays, Check,
  ChevronRight, CircleDollarSign, ClipboardList, Clock3, Dumbbell, Flame, Gauge,
  House, LayoutDashboard, Menu, MoreHorizontal, Palette, Play, Plus, Search, Settings,
  ShieldCheck, Sparkles, Trophy, User, UserRoundCheck, Users, WalletCards, X, Zap,
} from "lucide-react";

type StudentTab = "inicio" | "treinos" | "evolucao" | "agenda" | "perfil";
type Role = "aluno" | "professor" | "gestao";
type Theme = "forja" | "ferro" | "neutro";

const navItems = [
  ["inicio", House, "Início"],
  ["treinos", Dumbbell, "Treinos"],
  ["evolucao", BarChart3, "Evolução"],
  ["agenda", CalendarDays, "Agenda"],
  ["perfil", User, "Perfil"],
] as const;

const workoutPlan = [
  { name: "Agachamento livre", group: "Quadríceps", sets: 4, reps: "10", load: "32", rest: "75 s" },
  { name: "Leg press 45°", group: "Pernas", sets: 4, reps: "12", load: "80", rest: "60 s" },
  { name: "Afundo com halteres", group: "Glúteos", sets: 3, reps: "10", load: "12", rest: "60 s" },
  { name: "Panturrilha em pé", group: "Panturrilhas", sets: 4, reps: "15", load: "24", rest: "45 s" },
];

export default function Home() {
  const [role, setRole] = useState<Role>("aluno");
  const [theme, setTheme] = useState<Theme>("forja");
  const [activeTab, setActiveTab] = useState<StudentTab>("inicio");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [completedSets, setCompletedSets] = useState<string[]>([]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("orquestra_fit_theme");
    if (savedTheme !== "forja" && savedTheme !== "ferro" && savedTheme !== "neutro") return;
    const restoreTheme = window.setTimeout(() => setTheme(savedTheme), 0);
    return () => window.clearTimeout(restoreTheme);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("orquestra_fit_theme", theme);
  }, [theme]);

  return (
    <main className={role === "aluno" ? "v3-page" : "v3-page desktop-mode"} data-theme={theme}>
      <div className="prototype-flag"><Sparkles size={14} /> Protótipo demonstrativo</div>
      <RoleSwitcher role={role} onChange={(nextRole) => { setRole(nextRole); setSessionOpen(false); setMenuOpen(false); }} />
      <ThemeSwitcher theme={theme} onChange={setTheme} />
      {role === "aluno" && (
        <section className={sessionOpen ? "student-app session-active" : "student-app"}>
          {sessionOpen ? (
            <WorkoutSession
              completedSets={completedSets}
              onBack={() => setSessionOpen(false)}
              onToggleSet={(id) =>
                setCompletedSets((current) =>
                  current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                )
              }
            />
          ) : (
            <>
              <StudentHeader onMenu={() => setMenuOpen(true)} />
              <div className="student-scroll">
                {activeTab === "inicio" && <StudentHome onStart={() => setSessionOpen(true)} />}
                {activeTab === "treinos" && <WorkoutLibrary onStart={() => setSessionOpen(true)} />}
                {activeTab === "evolucao" && <Evolution />}
                {activeTab === "agenda" && <Agenda />}
                {activeTab === "perfil" && <Profile />}
              </div>
              <StudentNav activeTab={activeTab} onChange={setActiveTab} />
            </>
          )}
          {menuOpen && <StudentDrawer onClose={() => setMenuOpen(false)} onChange={setActiveTab} />}
        </section>
      )}
      {role === "professor" && <ProfessorWorkspace />}
      {role === "gestao" && <AdminWorkspace />}
    </main>
  );
}

function ThemeSwitcher({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const themes: { id: Theme; label: string }[] = [
    { id: "forja", label: "Forja escura" },
    { id: "ferro", label: "Ferro claro" },
    { id: "neutro", label: "Neutro" },
  ];
  return (
    <div className="theme-switcher" aria-label="Escolher tema">
      <Palette aria-hidden="true" />
      {themes.map((item) => (
        <button
          key={item.id}
          className={theme === item.id ? `theme-swatch ${item.id} active` : `theme-swatch ${item.id}`}
          aria-label={item.label}
          title={item.label}
          onClick={() => onChange(item.id)}
        />
      ))}
    </div>
  );
}

function RoleSwitcher({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <div className="role-switcher" aria-label="Alternar perfil demonstrativo">
      {(["aluno", "professor", "gestao"] as Role[]).map((item) => (
        <button key={item} className={role === item ? "active" : ""} onClick={() => onChange(item)}>
          {item === "gestao" ? "Gestão" : item[0].toUpperCase() + item.slice(1)}
        </button>
      ))}
    </div>
  );
}

function StudentHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="student-header">
      <AcademyBrand />
      <div className="header-actions">
        <button aria-label="Notificações" className="icon-button"><Bell size={20} /><i /></button>
        <button aria-label="Abrir menu" className="icon-button bronze" onClick={onMenu}><Menu size={22} /></button>
      </div>
    </header>
  );
}

function AcademyBrand() {
  return (
    <div className="academy-brand">
      <Image src="/dama-de-ferro.jpeg" alt="Dama de Ferro Academia" width={106} height={106} priority />
      <div><span>Dama de Ferro</span><small>Academia</small></div>
    </div>
  );
}

function StudentHome({ onStart }: { onStart: () => void }) {
  return (
    <div className="student-view home-view">
      <section className="welcome-row">
        <div><p>SEGUNDA, 1 DE SETEMBRO</p><h1>Bora treinar, Alecsander?</h1><span>Seu próximo passo já está pronto.</span></div>
        <div className="streak" aria-label="Sequência de treinos"><Flame size={20} /><strong>4</strong><small>semanas</small></div>
      </section>

      <article className="today-workout">
        <div className="workout-copy">
          <div className="eyebrow"><span /> MISSÃO DE HOJE</div>
          <h2>Força A</h2>
          <p>Pernas e estabilidade</p>
          <div className="workout-meta">
            <span><Clock3 size={16} /> 52 min</span>
            <span><Dumbbell size={16} /> 8 exercícios</span>
          </div>
          <button onClick={onStart}>Bora começar <ArrowRight size={19} /></button>
        </div>
        <div className="workout-art" aria-hidden="true"><Image src="/dama-de-ferro.jpeg" alt="" fill sizes="290px" priority /></div>
        <span className="steel-number">01</span>
      </article>

      <section className="status-grid">
        <article>
          <span className="status-icon"><ShieldCheck /></span>
          <div><small>Plano</small><strong>Ativo</strong><p>Renova em 18 dias</p></div><ChevronRight />
        </article>
        <article>
          <span className="status-icon"><Activity /></span>
          <div><small>Frequência</small><strong>9 visitas</strong><p>Meta: 12 no mês</p></div>
          <div className="mini-progress"><i /></div>
        </article>
      </section>

      <article className="weekly-mission">
        <span className="mission-icon"><Zap /></span>
        <div>
          <small>META DA SEMANA</small>
          <strong>Falta só mais um treino</strong>
          <p>Você já completou 3 de 4. Fecha essa meta hoje?</p>
          <div className="mission-progress"><i /></div>
        </div>
        <button onClick={onStart} aria-label="Começar treino para completar a meta"><ArrowRight /></button>
      </article>

      <section className="section-block">
        <div className="section-heading">
          <div><span>SEU DESEMPENHO</span><h2>Seu ritmo esta semana</h2></div><button>Ver detalhes</button>
        </div>
        <article className="weekly-card">
          <div className="week-bars">
            {[42, 74, 28, 86, 58, 18, 8].map((height, index) => (
              <div key={index}><i style={{ height: `${height}%` }} className={index === 3 ? "peak" : ""} /><span>{["S", "T", "Q", "Q", "S", "S", "D"][index]}</span></div>
            ))}
          </div>
          <div className="weekly-score"><Gauge size={24} /><div><strong>3 de 4</strong><span>treinos concluídos</span></div></div>
        </article>
      </section>

      <article className="academy-note">
        <div className="note-mark">DF</div>
        <div><span>COMUNICADO DA ACADEMIA</span><h3>Avaliação física disponível</h3><p>Reserve um horário com a equipe para acompanhar sua evolução.</p></div>
        <ChevronRight />
      </article>
    </div>
  );
}

function WorkoutLibrary({ onStart }: { onStart: () => void }) {
  const plans = [
    { title: "Força A", subtitle: "Pernas e estabilidade", time: "52 min", active: true },
    { title: "Força B", subtitle: "Costas e bíceps", time: "48 min" },
    { title: "Força C", subtitle: "Peito e tríceps", time: "45 min" },
    { title: "Condicionamento", subtitle: "Cardio e mobilidade", time: "35 min" },
  ];
  return (
    <div className="student-view">
      <PageIntro kicker="PROGRAMA ATUAL" title="Seus treinos" copy="Um plano construído para evoluir com consistência." />
      <div className="program-summary">
        <div><small>Ciclo</small><strong>Hipertrofia · 6 semanas</strong></div><span>SEMANA 4</span>
        <div className="program-line"><i /></div>
      </div>
      <div className="workout-list">
        {plans.map((plan, index) => (
          <button key={plan.title} className={plan.active ? "active" : ""} onClick={onStart}>
            <span className="workout-index">0{index + 1}</span>
            <div><small>{plan.active ? "PROGRAMADO PARA HOJE" : "PRÓXIMO TREINO"}</small><strong>{plan.title}</strong><p>{plan.subtitle} · {plan.time}</p></div>
            <span className="play-button"><Play size={18} fill="currentColor" /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Evolution() {
  return (
    <div className="student-view">
      <PageIntro kicker="ACOMPANHAMENTO" title="Sua evolução" copy="Consistência que aparece nos números." />
      <div className="evolution-hero"><span>FREQUÊNCIA NO MÊS</span><strong>75%</strong><p>9 de 12 visitas planejadas</p><div><i /></div></div>
      <section className="evolution-grid">
        <article><Trophy /><small>Sequência</small><strong>4 semanas</strong><p>Seu melhor ritmo até agora</p></article>
        <article><Activity /><small>Carga total</small><strong>+12%</strong><p>Comparado ao ciclo anterior</p></article>
      </section>
      <section className="history-panel">
        <div className="section-heading"><div><span>HISTÓRICO</span><h2>Últimos registros</h2></div></div>
        {["Agachamento livre", "Leg press 45°", "Supino reto"].map((item, index) => (
          <div className="history-row" key={item}><span>{item}</span><strong>{["32 kg", "80 kg", "36 kg"][index]}</strong><small>melhor carga</small></div>
        ))}
      </section>
    </div>
  );
}

function Agenda() {
  return (
    <div className="student-view">
      <PageIntro kicker="AULAS E RESERVAS" title="Sua agenda" copy="Organize a semana sem perder o ritmo." />
      <div className="date-selector">
        {["SEG\n01", "TER\n02", "QUA\n03", "QUI\n04", "SEX\n05"].map((day, index) => (
          <button className={index === 0 ? "active" : ""} key={day}>{day.split("\n").map((part) => <span key={part}>{part}</span>)}</button>
        ))}
      </div>
      <article className="class-card">
        <div className="class-time"><strong>19:00</strong><span>50 min</span></div>
        <div><small>FUNCIONAL</small><h2>Força & Mobilidade</h2><p>Prof. Camila · 8 vagas restantes</p></div>
        <button>Reservar</button>
      </article>
      <div className="empty-agenda"><CalendarDays /><h3>Nenhuma outra aula hoje</h3><p>Explore os próximos dias para encontrar mais horários.</p></div>
    </div>
  );
}

function Profile() {
  const links = [
    { icon: User, label: "Dados pessoais" },
    { icon: WalletCards, label: "Plano e mensalidades" },
    { icon: Activity, label: "Avaliações físicas" },
    { icon: ShieldCheck, label: "Privacidade e segurança" },
  ];
  return (
    <div className="student-view profile-view">
      <div className="profile-identity"><span>AL</span><small>ALUNO</small><h1>Alecsander Lima</h1><p>Ambiente demonstrativo</p></div>
      {links.map(({ icon: Icon, label }) => <button className="profile-link" key={label}><Icon /><span>{label}</span><ChevronRight /></button>)}
      <div className="powered-by"><span>Plataforma</span><strong>Orquestra Fit</strong><small>versão demonstrativa</small></div>
    </div>
  );
}

function WorkoutSession({ completedSets, onBack, onToggleSet }: { completedSets: string[]; onBack: () => void; onToggleSet: (id: string) => void }) {
  const totalSets = workoutPlan.reduce((sum, item) => sum + item.sets, 0);
  const progress = Math.round((completedSets.length / totalSets) * 100);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, [seconds]);

  return (
    <div className="session-view">
      <header className="session-top">
        <button aria-label="Voltar" onClick={onBack}><ArrowLeft /></button>
        <div><small>TREINO EM ANDAMENTO</small><strong>{elapsed}</strong></div><span>{progress}%</span>
      </header>
      <section className="session-title">
        <div><span>FORÇA A</span><h1>Pernas e estabilidade</h1><p>{completedSets.length} de {totalSets} séries concluídas</p></div>
        <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><strong>{progress}%</strong></div>
      </section>
      <div className="session-exercises">
        {workoutPlan.map((exercise, exerciseIndex) => (
          <article className="exercise-card" key={exercise.name}>
            <header><span>0{exerciseIndex + 1}</span><div><small>{exercise.group}</small><h2>{exercise.name}</h2></div><button aria-label="Ver demonstração"><Play size={17} fill="currentColor" /></button></header>
            <div className="set-labels"><span>Série</span><span>Carga</span><span>Repetições</span><span>Feito</span></div>
            {Array.from({ length: exercise.sets }).map((_, setIndex) => {
              const id = `${exerciseIndex}-${setIndex}`;
              const done = completedSets.includes(id);
              return (
                <div className={done ? "set-row done" : "set-row"} key={id}>
                  <strong>{setIndex + 1}</strong>
                  <label><input defaultValue={exercise.load} inputMode="numeric" aria-label="Carga" /><span>kg</span></label>
                  <label><input defaultValue={exercise.reps} inputMode="numeric" aria-label="Repetições" /><span>rep</span></label>
                  <button aria-label={`Concluir série ${setIndex + 1}`} onClick={() => onToggleSet(id)}>{done && <Check size={18} />}</button>
                </div>
              );
            })}
            <footer><Clock3 size={16} /> Descanso recomendado: <strong>{exercise.rest}</strong></footer>
          </article>
        ))}
      </div>
      <button className="finish-workout" disabled={completedSets.length < totalSets}><Trophy size={20} /> Concluir treino</button>
    </div>
  );
}

const workspaceNav = [
  ["Visão geral", LayoutDashboard],
  ["Alunos", Users],
  ["Professores", UserRoundCheck],
  ["Planos e mensalidades", WalletCards],
  ["Treinos", Dumbbell],
  ["Aulas e reservas", CalendarDays],
  ["Avaliações", BarChart3],
] as const;

const demoStudents = [
  { initials: "AP", name: "Ana Paula Martins", plan: "Semestral", status: "Em dia", visits: "18", next: "Hoje, 18:30" },
  { initials: "CE", name: "Carlos Eduardo", plan: "Mensal", status: "Vence hoje", visits: "12", next: "Amanhã" },
  { initials: "MS", name: "Mariana Souza", plan: "Anual", status: "Em dia", visits: "21", next: "Hoje, 20:00" },
  { initials: "JH", name: "João Henrique", plan: "Mensal", status: "Em atraso", visits: "7", next: "Sem treino" },
];

function WorkspaceShell({ children, profile }: { children: React.ReactNode; profile: "Gestão" | "Professor" }) {
  return (
    <section className="workspace-shell">
      <aside className="workspace-rail">
        <AcademyBrand />
        <nav>
          {workspaceNav.map(([label, Icon], index) => (
            <button key={label} className={index === 0 ? "active" : ""}><Icon /><span>{label}</span></button>
          ))}
        </nav>
        <button className="rail-settings"><Settings /><span>Configurações</span></button>
        <div className="rail-powered"><small>PLATAFORMA</small><strong>Orquestra Fit</strong></div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div><span>DAMA DE FERRO ACADEMIA</span><h1>{profile === "Gestão" ? "Visão geral" : "Área do professor"}</h1></div>
          <div className="workspace-actions">
            <button aria-label="Buscar"><Search /></button>
            <button aria-label="Notificações"><Bell /></button>
            <div className="operator"><span>{profile === "Gestão" ? "GL" : "RC"}</span><div><strong>{profile === "Gestão" ? "Grazielle Lima" : "Rômulo Corrêa"}</strong><small>{profile}</small></div></div>
          </div>
        </header>
        {children}
      </div>
    </section>
  );
}

function AdminWorkspace() {
  return (
    <WorkspaceShell profile="Gestão">
      <div className="workspace-content">
        <section className="workspace-intro">
          <div><span>SEGUNDA, 1 DE SETEMBRO · DADOS DEMONSTRATIVOS</span><h2>Tudo no ritmo por aqui.</h2><p>Veja o movimento da academia e resolva o que precisa de atenção hoje.</p></div>
          <button><Plus /> Novo aluno</button>
        </section>
        <section className="metric-grid">
          <MetricCard icon={Users} label="Alunos ativos" value="184" note="+8 neste mês" />
          <MetricCard icon={CircleDollarSign} label="Receita prevista" value="R$ 26.180" note="82% já recebido" />
          <MetricCard icon={Banknote} label="Em aberto" value="R$ 4.720" note="31 mensalidades" warning />
          <MetricCard icon={Activity} label="Frequência hoje" value="96" note="37 alunos agora" />
        </section>
        <section className="operations-grid">
          <article className="workspace-panel student-table-panel">
            <header><div><span>OPERAÇÃO</span><h3>Alunos para acompanhar</h3><p>Planos, frequência e próximos treinos.</p></div><button>Ver todos <ArrowRight /></button></header>
            <div className="workspace-search"><Search /><input placeholder="Buscar aluno" /></div>
            <div className="student-table">
              <div className="table-row table-head"><span>Aluno</span><span>Plano</span><span>Situação</span><span>Visitas</span><span>Próximo treino</span><span /></div>
              {demoStudents.map((student) => (
                <div className="table-row" key={student.name}>
                  <span className="table-person"><i>{student.initials}</i><strong>{student.name}</strong></span>
                  <span>{student.plan}</span>
                  <span><em className={student.status === "Em atraso" ? "late" : student.status === "Vence hoje" ? "due" : ""}>{student.status}</em></span>
                  <span>{student.visits}</span><span>{student.next}</span><button aria-label={`Abrir ${student.name}`}><ChevronRight /></button>
                </div>
              ))}
            </div>
          </article>
          <aside className="workspace-panel finance-card">
            <header><div><span>FINANCEIRO</span><h3>Recebimentos do mês</h3></div><button aria-label="Mais opções"><MoreHorizontal /></button></header>
            <div className="finance-total"><small>PREVISTO</small><strong>R$ 26.180</strong><span>Setembro de 2026</span></div>
            <div className="finance-bar"><i /><b /></div>
            <div className="finance-legend">
              <div><span><i className="received" />Recebido</span><strong>R$ 21.460</strong></div>
              <div><span><i className="pending" />Pendente</span><strong>R$ 3.320</strong></div>
              <div><span><i className="overdue" />Em atraso</span><strong>R$ 1.400</strong></div>
            </div>
            <button className="outline-action">Abrir financeiro <ArrowRight /></button>
          </aside>
        </section>
        <section className="admin-lower">
          <article><span>AÇÕES RÁPIDAS</span><h3>O que precisa acontecer hoje</h3><div><button><UserRoundCheck />Cadastrar professor</button><button><ClipboardList />Montar ficha de treino</button><button><CalendarDays />Criar aula</button></div></article>
          <article className="occupancy"><div><span>OCUPAÇÃO AGORA</span><strong>37 <small>alunos</small></strong></div><div className="occupancy-bars">{[25,42,58,79,94,61,38,18].map((value, index) => <i key={index} style={{height: `${value}%`}} />)}</div></article>
        </section>
      </div>
    </WorkspaceShell>
  );
}

function ProfessorWorkspace() {
  const today = [
    { time: "17:30", name: "Ana Paula Martins", focus: "Revisão · Força A", status: "Aguardando" },
    { time: "18:30", name: "Mariana Souza", focus: "Avaliação física", status: "Confirmado" },
    { time: "20:00", name: "Carlos Eduardo", focus: "Novo ciclo de treino", status: "Pendente" },
  ];
  return (
    <WorkspaceShell profile="Professor">
      <div className="workspace-content">
        <section className="workspace-intro">
          <div><span>SEGUNDA, 1 DE SETEMBRO · DADOS DEMONSTRATIVOS</span><h2>Bora cuidar da evolução da turma.</h2><p>Veja quem precisa de treino novo, revisão ou avaliação.</p></div>
          <button><Plus /> Criar treino</button>
        </section>
        <section className="professor-summary">
          <article className="professor-focus">
            <span>PRÓXIMO ATENDIMENTO</span><div className="focus-time">17:30 <small>HOJE</small></div>
            <div className="focus-student"><i>AP</i><div><strong>Ana Paula Martins</strong><p>Revisão do treino Força A</p></div></div>
            <button>Abrir perfil da aluna <ArrowRight /></button>
          </article>
          <div className="professor-metrics">
            <MetricCard icon={Users} label="Meus alunos" value="38" note="34 ativos esta semana" />
            <MetricCard icon={ClipboardList} label="Treinos a revisar" value="6" note="2 vencem hoje" warning />
          </div>
        </section>
        <section className="professor-grid">
          <article className="workspace-panel agenda-panel">
            <header><div><span>AGENDA DE HOJE</span><h3>Atendimentos</h3></div><button>Ver semana <ArrowRight /></button></header>
            {today.map((item) => (
              <div className="appointment" key={item.time}><strong>{item.time}</strong><div><h4>{item.name}</h4><p>{item.focus}</p></div><em className={item.status === "Confirmado" ? "confirmed" : ""}>{item.status}</em><button aria-label="Abrir"><ChevronRight /></button></div>
            ))}
          </article>
          <article className="workspace-panel attention-panel">
            <header><div><span>ACOMPANHAMENTO</span><h3>Precisam de atenção</h3></div></header>
            {demoStudents.slice(1).map((student, index) => (
              <button key={student.name}><i>{student.initials}</i><div><strong>{student.name}</strong><span>{["Ficha vence em 2 dias", "14 dias sem treinar", "Avaliação pendente"][index]}</span></div><ChevronRight /></button>
            ))}
          </article>
        </section>
      </div>
    </WorkspaceShell>
  );
}

function MetricCard({ icon: Icon, label, value, note, warning = false }: { icon: typeof Users; label: string; value: string; note: string; warning?: boolean }) {
  return (
    <article className={warning ? "metric-card warning" : "metric-card"}>
      <div className="metric-icon"><Icon /></div><span>{label}</span><strong>{value}</strong><small>{note}</small>
    </article>
  );
}

function PageIntro({ kicker, title, copy }: { kicker: string; title: string; copy: string }) {
  return <header className="page-intro"><span>{kicker}</span><h1>{title}</h1><p>{copy}</p></header>;
}

function StudentNav({ activeTab, onChange }: { activeTab: StudentTab; onChange: (tab: StudentTab) => void }) {
  return <nav className="student-nav">{navItems.map(([id, Icon, label]) => <button key={id} className={activeTab === id ? "active" : ""} onClick={() => onChange(id)}><Icon /><span>{label}</span></button>)}</nav>;
}

function StudentDrawer({ onClose, onChange }: { onClose: () => void; onChange: (tab: StudentTab) => void }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="student-drawer" onClick={(event) => event.stopPropagation()}>
        <header><AcademyBrand /><button aria-label="Fechar" onClick={onClose}><X /></button></header>
        <div className="drawer-profile"><span>AL</span><div><strong>Alecsander Lima</strong><small>Aluno · plano ativo</small></div></div>
        <nav>{navItems.map(([id, Icon, label]) => <button key={id} onClick={() => { onChange(id); onClose(); }}><Icon /><span>{label}</span><ChevronRight /></button>)}</nav>
        <div className="drawer-footer"><small>TECNOLOGIA</small><strong>Orquestra Fit</strong><span>Ambiente demonstrativo</span></div>
      </aside>
    </div>
  );
}
