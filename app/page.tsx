"use client";

import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  Bookmark,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  Dumbbell,
  House,
  LogOut,
  Menu,
  MessageCircle,
  Play,
  QrCode,
  Search,
  Settings,
  Timer,
  User,
  Users,
  WalletCards,
  X,
} from "lucide-react";

type StudentTab = "inicio" | "treino" | "avaliacoes" | "aulas" | "reservas";

const students = [
  { name: "Ana Paula", plan: "Semestral", due: "Em dia", visits: 18 },
  { name: "Carlos Eduardo", plan: "Mensal", due: "Vence hoje", visits: 12 },
  { name: "Mariana Souza", plan: "Anual", due: "Em dia", visits: 21 },
  { name: "João Henrique", plan: "Mensal", due: "Atrasado", visits: 7 },
];

const workoutQueue = ["Treino F", "Treino C", "Treino E", "Treino D", "Treino B"];

const workoutExercises = [
  {
    name: "Cavalo pegada pronada",
    sets: 3,
    load: "0 kg",
    reps: "máq. 0",
    rest: "50 seg",
  },
  {
    name: "Remada baixa barra romana",
    sets: 3,
    load: "0 kg",
    reps: "máq. 0",
    rest: "50 seg",
  },
  {
    name: "Puxada alta aberta",
    sets: 4,
    load: "25 kg",
    reps: "12 rep.",
    rest: "60 seg",
  },
];

const bottomTabs = [
  ["inicio", House, "Início"],
  ["treino", Dumbbell, "Treino"],
  ["avaliacoes", BarChart3, "Avaliações"],
  ["aulas", CalendarDays, "Aulas"],
  ["reservas", BookOpen, "Reservas"],
] as const;

const menuItems = [
  [House, "Início"],
  [Dumbbell, "Treino"],
  [Timer, "Cronômetros"],
  [User, "Meu Perfil"],
  [BarChart3, "Avaliações Físicas"],
  [Activity, "Relatórios de Evolução"],
  [ClipboardCheck, "Graduações"],
  [Bookmark, "Minha Academia"],
  [CalendarDays, "Aulas"],
  [BookOpen, "Minhas Reservas"],
  [CalendarDays, "Relatório de Aulas", "Novo"],
  [Check, "Minha Frequência"],
  [CreditCard, "Dados de Pagamento"],
  [MessageCircle, "Chat"],
] as const;

export default function Home() {
  const [mode, setMode] = useState<"gestao" | "aluno">("aluno");
  const [tab, setTab] = useState("Visão geral");
  const [studentTab, setStudentTab] = useState<StudentTab>("inicio");
  const [menuOpen, setMenuOpen] = useState(false);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [completed, setCompleted] = useState<number[]>([]);

  return (
    <main className="app-shell">
      <div className="mode-switch">
        <button className={mode === "gestao" ? "active" : ""} onClick={() => setMode("gestao")}>
          Gestão
        </button>
        <button className={mode === "aluno" ? "active" : ""} onClick={() => setMode("aluno")}>
          App do aluno
        </button>
      </div>
      {mode === "gestao" ? (
        <AdminDashboard tab={tab} onTabChange={setTab} />
      ) : (
        <StudentApp
          activeTab={studentTab}
          completed={completed}
          menuOpen={menuOpen}
          workoutOpen={workoutOpen}
          onCloseMenu={() => setMenuOpen(false)}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenWorkout={() => setWorkoutOpen(true)}
          onTabChange={(nextTab) => {
            setWorkoutOpen(false);
            setMenuOpen(false);
            setStudentTab(nextTab);
          }}
          onBackWorkout={() => setWorkoutOpen(false)}
          onToggleSet={(index) =>
            setCompleted((items) =>
              items.includes(index) ? items.filter((item) => item !== index) : [...items, index],
            )
          }
        />
      )}
    </main>
  );
}

function AdminDashboard({ tab, onTabChange }: { tab: string; onTabChange: (tab: string) => void }) {
  return (
    <section className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <span>O</span> Orquestra <b>Fit</b>
        </div>
        <nav>
          {(
            [
              ["Visão geral", House],
              ["Alunos", Users],
              ["Financeiro", WalletCards],
              ["Treinos", Dumbbell],
              ["Aulas", CalendarDays],
              ["Relatórios", BarChart3],
            ] as const
          ).map(([label, Icon]) => (
            <button key={label} className={tab === label ? "selected" : ""} onClick={() => onTabChange(label)}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="settings">
          <Settings size={20} /> <span>Configurações</span>
        </button>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <p>SEGUNDA-FEIRA, 1 DE SETEMBRO</p>
            <h1>{tab}</h1>
          </div>
          <div className="admin">
            <span>AL</span>
            <div>
              <b>Alecsander Lima</b>
              <small>Administrador</small>
            </div>
          </div>
        </header>
        <div className="content">
          <section className="welcome">
            <div>
              <small>RESUMO DE HOJE</small>
              <h2>Boa tarde, Alecsander.</h2>
              <p>A academia está com bom movimento. Você já recebeu 82% das mensalidades deste mês.</p>
            </div>
            <div className="pulse">
              <Activity size={30} />
              <span>37</span>
              <small>alunos agora</small>
            </div>
          </section>
          <section className="stats">
            <Stat icon={<Users />} label="Alunos ativos" value="184" change="+8 este mês" />
            <Stat icon={<CircleDollarSign />} label="Receita em setembro" value="R$ 21.460" change="82% recebido" />
            <Stat icon={<Banknote />} label="A receber" value="R$ 4.720" change="31 mensalidades" warning />
            <Stat icon={<CalendarDays />} label="Aulas hoje" value="7" change="46 reservas" />
          </section>
          <section className="grid-main">
            <article className="panel students-panel">
              <div className="panel-head">
                <div>
                  <h3>Alunos</h3>
                  <p>Acompanhe presença e situação dos planos</p>
                </div>
                <button className="primary">+ Novo aluno</button>
              </div>
              <div className="search">
                <Search size={18} />
                <input placeholder="Buscar aluno..." />
              </div>
              <div className="table">
                <div className="tr labels">
                  <span>Aluno</span>
                  <span>Plano</span>
                  <span>Situação</span>
                  <span>Frequência</span>
                  <span />
                </div>
                {students.map((student) => (
                  <div className="tr" key={student.name}>
                    <span className="student">
                      <i>{student.name.split(" ").map((name) => name[0]).slice(0, 2).join("")}</i>
                      <b>{student.name}</b>
                    </span>
                    <span>{student.plan}</span>
                    <span>
                      <em className={student.due === "Atrasado" ? "late" : student.due === "Vence hoje" ? "today" : ""}>
                        {student.due}
                      </em>
                    </span>
                    <span>{student.visits} visitas</span>
                    <ChevronRight size={18} />
                  </div>
                ))}
              </div>
            </article>
            <aside className="panel finance-panel">
              <div className="panel-head">
                <div>
                  <h3>Financeiro</h3>
                  <p>Setembro de 2026</p>
                </div>
                <ArrowUpRight size={20} />
              </div>
              <div className="ring">
                <div>
                  <strong>82%</strong>
                  <span>recebido</span>
                </div>
              </div>
              <Money label="Recebido" value="R$ 21.460" color="green" />
              <Money label="Pendente" value="R$ 3.320" color="amber" />
              <Money label="Atrasado" value="R$ 1.400" color="red" />
              <button className="secondary">Ver financeiro completo</button>
            </aside>
          </section>
        </div>
      </div>
    </section>
  );
}

function StudentApp({
  activeTab,
  completed,
  menuOpen,
  workoutOpen,
  onBackWorkout,
  onCloseMenu,
  onOpenMenu,
  onOpenWorkout,
  onTabChange,
  onToggleSet,
}: {
  activeTab: StudentTab;
  completed: number[];
  menuOpen: boolean;
  workoutOpen: boolean;
  onBackWorkout: () => void;
  onCloseMenu: () => void;
  onOpenMenu: () => void;
  onOpenWorkout: () => void;
  onTabChange: (tab: StudentTab) => void;
  onToggleSet: (index: number) => void;
}) {
  return (
    <section className={workoutOpen ? "phone workout-running" : "phone"}>
      {workoutOpen ? (
        <WorkoutSession completed={completed} onBack={onBackWorkout} onOpenMenu={onOpenMenu} onToggleSet={onToggleSet} />
      ) : (
        <>
          <MobileHeader activeTab={activeTab} onOpenMenu={onOpenMenu} />
          <div className="mobile-content">{renderStudentTab(activeTab, onOpenWorkout)}</div>
          <BottomNav activeTab={activeTab} onTabChange={onTabChange} />
        </>
      )}
      {menuOpen && <StudentMenu onClose={onCloseMenu} onTabChange={onTabChange} />}
    </section>
  );
}

function MobileHeader({ activeTab, onOpenMenu }: { activeTab: StudentTab; onOpenMenu: () => void }) {
  const isHome = activeTab === "inicio";
  return (
    <header className="mobile-head">
      {isHome ? (
        <div className="profile-title">
          <span className="avatar">
            <User size={31} />
          </span>
          <div>
            <strong>Olá, Alecsander</strong>
            <small>Pronto para o treino?</small>
          </div>
        </div>
      ) : (
        <div className="mobile-brand">
          <span>O</span> Orquestra <b>Fit</b>
        </div>
      )}
      <div className="head-actions">
        {isHome && (
          <button aria-label="Abrir QR Code">
            <QrCode />
          </button>
        )}
        <button aria-label="Abrir menu" onClick={onOpenMenu}>
          <Menu />
        </button>
      </div>
    </header>
  );
}

function renderStudentTab(activeTab: StudentTab, onOpenWorkout: () => void) {
  if (activeTab === "treino") return <WorkoutHub onOpenWorkout={onOpenWorkout} />;
  if (activeTab === "avaliacoes") return <Assessments />;
  if (activeTab === "aulas") return <Classes title="Próximas Aulas" message="Não há aulas para essa data." helper="Confira outras datas." />;
  if (activeTab === "reservas") return <Classes title="Minhas Reservas" message="Não há aulas agendadas." helper='Acesse o menu "Aulas" para agendar.' />;
  return <StudentHome onOpenWorkout={onOpenWorkout} />;
}

function StudentHome({ onOpenWorkout }: { onOpenWorkout: () => void }) {
  return (
    <>
      <article className="payment-alert">
        <span>
          <Bell size={30} />
        </span>
        <h2>Hey! Sua mensalidade venceu...</h2>
        <p>A sua mensalidade venceu dia 31/08/2026. Faça o pagamento de forma conveniente por aqui.</p>
        <button>Pagar</button>
      </article>
      <WorkoutHero compact onOpenWorkout={onOpenWorkout} />
      <article className="feed-card">
        <div className="feed-author">
          <span className="avatar small">
            <User />
          </span>
          <div>
            <strong>Professor Rômulo Corrêa</strong>
            <small>1 de setembro de 2026</small>
          </div>
        </div>
        <p>Nosso contato está disponível sempre que precisar. Chame no WhatsApp da academia para ajustes no treino.</p>
        <div className="feed-banner">
          <b>Orquestra Fit</b>
          <span>comunidade ativa</span>
        </div>
      </article>
    </>
  );
}

function WorkoutHub({ onOpenWorkout }: { onOpenWorkout: () => void }) {
  return (
    <>
      <WorkoutHero onOpenWorkout={onOpenWorkout} />
      <section className="next-workouts">
        <h2>Próximos treinos</h2>
        {workoutQueue.map((workout, index) => (
          <button key={workout} onClick={onOpenWorkout}>
            <strong>{workout}</strong>
            <Play fill="currentColor" size={24} />
            {index === workoutQueue.length - 1 && <span className="mini-pause">II</span>}
          </button>
        ))}
      </section>
    </>
  );
}

function WorkoutHero({ compact = false, onOpenWorkout }: { compact?: boolean; onOpenWorkout: () => void }) {
  return (
    <article className={compact ? "student-workout-card compact" : "student-workout-card"}>
      <div>
        <h2>Treino A</h2>
        <p>Treino previsto para hoje</p>
      </div>
      <button onClick={onOpenWorkout}>
        Começar treino <Play fill="currentColor" size={20} />
      </button>
      <div className="athlete-photo" aria-hidden="true" />
    </article>
  );
}

function Assessments() {
  return (
    <>
      <button className="wide-row">
        <ClipboardCheck />
        <strong>Preencher Anamnese</strong>
        <ChevronRight />
      </button>
      <div className="section-title dark">
        <h2>Avaliações Físicas</h2>
        <span>0 itens</span>
      </div>
      <button className="assessment-next">
        <CalendarDays />
        <strong>Próxima Avaliação</strong>
      </button>
      <EmptyState message="Não há Avaliações Físicas!" helper="Você ainda não possui uma Avaliação Física. Entre em contato com o seu professor." />
    </>
  );
}

function Classes({ title, message, helper }: { title: string; message: string; helper: string }) {
  return (
    <>
      <CalendarStrip />
      <h1 className="student-page-title">{title}</h1>
      <EmptyState message={message} helper={helper} />
    </>
  );
}

function CalendarStrip() {
  return (
    <section className="calendar-area">
      <div className="month-row">
        <CalendarDays />
        <h1>Setembro de 2026</h1>
        <div>
          <button>
            <ChevronLeft />
          </button>
          <button>
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="date-strip">
        <button className="active">Hoje, 01 Set.</button>
        <button>2</button>
        <button>3</button>
        <button>4</button>
      </div>
    </section>
  );
}

function EmptyState({ message, helper }: { message: string; helper: string }) {
  return (
    <section className="empty-state">
      <span>
        <Bell />
      </span>
      <h2>{message}</h2>
      <p>{helper}</p>
    </section>
  );
}

function WorkoutSession({
  completed,
  onBack,
  onOpenMenu,
  onToggleSet,
}: {
  completed: number[];
  onBack: () => void;
  onOpenMenu: () => void;
  onToggleSet: (index: number) => void;
}) {
  return (
    <>
      <header className="session-head">
        <button aria-label="Voltar" onClick={onBack}>
          <ArrowLeft />
        </button>
        <div>
          <strong>Orquestra Fit</strong>
          <small>00:02</small>
        </div>
        <button aria-label="Abrir menu" onClick={onOpenMenu}>
          <Menu />
        </button>
      </header>
      <section className="session-hero" />
      <div className="session-content">
        <h1>Treino A</h1>
        <span className="exercise-count">
          <Dumbbell size={19} /> 10 exerc
        </span>
        <div className="session-list">
          {workoutExercises.map((exercise, index) => (
            <article className="session-card" key={exercise.name}>
              <div className="exercise-media">
                <Play fill="currentColor" />
              </div>
              <div className="session-main">
                <button
                  className={completed.includes(index) ? "set-toggle done" : "set-toggle"}
                  aria-label={`Concluir ${exercise.name}`}
                  onClick={() => onToggleSet(index)}
                >
                  {completed.includes(index) && <Check size={18} />}
                </button>
                <h2>{exercise.name}</h2>
                <strong className={completed.includes(index) ? "remaining complete" : "remaining"}>
                  {completed.includes(index) ? "CONCLUÍDO" : `${exercise.sets} SÉRIES RESTANTES`}
                </strong>
                <div className="chips">
                  <span>{exercise.load}</span>
                  <span>{exercise.reps}</span>
                  <span>mais...</span>
                </div>
                <div className="series-dots">
                  <i className="active" />
                  <i />
                  <i />
                </div>
              </div>
              <button className="rest-button">Descansar ({exercise.rest})</button>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

function StudentMenu({ onClose, onTabChange }: { onClose: () => void; onTabChange: (tab: StudentTab) => void }) {
  return (
    <div className="menu-overlay">
      <aside className="student-menu">
        <header>
          <strong>Orquestra Fit</strong>
          <button aria-label="Fechar menu" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="menu-profile">
          <span className="avatar large">
            <User size={40} />
          </span>
          <h2>Alecsander Batista De Lima</h2>
          <p>alecs.b97@hotmail.com</p>
        </div>
        <nav>
          {menuItems.map(([Icon, label, badge]) => (
            <button
              key={label}
              onClick={() => {
                if (label === "Início") onTabChange("inicio");
                if (label === "Treino") onTabChange("treino");
                if (label === "Avaliações Físicas") onTabChange("avaliacoes");
                if (label === "Aulas") onTabChange("aulas");
                if (label === "Minhas Reservas") onTabChange("reservas");
                onClose();
              }}
            >
              <Icon />
              <span>{label}</span>
              {badge && <em>{badge}</em>}
            </button>
          ))}
        </nav>
        <button className="logout">
          <LogOut />
          Sair do Orquestra Fit
        </button>
      </aside>
    </div>
  );
}

function BottomNav({ activeTab, onTabChange }: { activeTab: StudentTab; onTabChange: (tab: StudentTab) => void }) {
  return (
    <nav className="bottom-nav">
      {bottomTabs.map(([id, Icon, label]) => (
        <button className={activeTab === id ? "current" : ""} key={id} onClick={() => onTabChange(id)}>
          <Icon size={23} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Stat({
  icon,
  label,
  value,
  change,
  warning = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  change: string;
  warning?: boolean;
}) {
  return (
    <article className="stat">
      <div className={warning ? "stat-icon warn" : "stat-icon"}>{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
      <small className={warning ? "warning" : ""}>{change}</small>
    </article>
  );
}

function Money({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="money-row">
      <span>
        <i className={color + "-dot"} />
        {label}
      </span>
      <b>{value}</b>
    </div>
  );
}
