"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import {
  Activity, ArrowLeft, ArrowRight, Banknote, BarChart3, Bell, CalendarDays, Check, Footprints,
  ChevronDown, ChevronRight, CircleDollarSign, ClipboardList, Clock3, Dumbbell, Flame, Gauge,
  House, LayoutDashboard, Menu, MoreHorizontal, Palette, Play, Plus, Search, Settings,
  PersonStanding, ShieldCheck, Sparkles, Trophy, User, UserRoundCheck, Users, WalletCards, X,
} from "lucide-react";
import { useAccess } from "@/components/auth/access-context";
import { auth, db } from "@/lib/firebase/client";

type StudentTab = "inicio" | "treinos" | "evolucao" | "agenda" | "perfil";
type Role = "aluno" | "professor" | "gestao";
type Theme = "bronze" | "prata";

const FeedbackContext = createContext<(message: string) => void>(() => undefined);

function useFeedback() {
  return useContext(FeedbackContext);
}

function accountName(displayName: string | null, email: string | null) {
  return displayName?.trim() || email?.split("@")[0] || "Usuário";
}

function firstName(displayName: string | null, email: string | null) {
  return accountName(displayName, email).split(/\s+/)[0];
}

async function logout() {
  if (!auth) return;
  try {
    await signOut(auth);
  } finally {
    window.location.reload();
  }
}

const navItems = [
  ["inicio", House, "Início"],
  ["treinos", Dumbbell, "Treinos"],
  ["evolucao", BarChart3, "Evolução"],
  ["agenda", CalendarDays, "Agenda"],
  ["perfil", User, "Perfil"],
] as const;

const workoutPlan = [
  { name: "Agachamento livre", group: "Quadríceps", sets: 4, reps: "10", load: "32", rest: "75 s", anatomyRegion: undefined, instructions: undefined, videoUrl: undefined },
  { name: "Leg press 45°", group: "Pernas", sets: 4, reps: "12", load: "80", rest: "60 s", anatomyRegion: undefined, instructions: undefined, videoUrl: undefined },
  { name: "Afundo com halteres", group: "Glúteos", sets: 3, reps: "10", load: "12", rest: "60 s", anatomyRegion: undefined, instructions: undefined, videoUrl: undefined },
  { name: "Panturrilha em pé", group: "Panturrilhas", sets: 4, reps: "15", load: "24", rest: "45 s", anatomyRegion: undefined, instructions: undefined, videoUrl: undefined },
];

const starterExercises = [
  ["Supino reto com barra", "Peito", "Tríceps, ombros", "Peitoral"],
  ["Supino inclinado com halteres", "Peito", "Tríceps, ombros", "Peitoral superior"],
  ["Crucifixo na máquina", "Peito", "Ombros", "Peitoral"],
  ["Puxada frontal", "Costas", "Bíceps", "Dorsais"],
  ["Remada baixa", "Costas", "Bíceps", "Dorsais e região central das costas"],
  ["Remada unilateral com halter", "Costas", "Bíceps", "Dorsais"],
  ["Desenvolvimento com halteres", "Ombros", "Tríceps", "Ombros"],
  ["Elevação lateral", "Ombros", "Trapézio", "Ombros"],
  ["Face pull", "Ombros", "Costas, bíceps", "Ombro posterior"],
  ["Rosca direta com barra", "Bíceps", "Antebraço", "Parte frontal do braço"],
  ["Rosca alternada com halteres", "Bíceps", "Antebraço", "Parte frontal do braço"],
  ["Rosca martelo", "Bíceps", "Antebraço", "Bíceps e antebraço"],
  ["Tríceps na polia", "Tríceps", "Ombros", "Parte posterior do braço"],
  ["Tríceps francês", "Tríceps", "Ombros", "Parte posterior do braço"],
  ["Rosca de punho", "Antebraço", "Bíceps", "Antebraços"],
  ["Agachamento livre", "Quadríceps", "Glúteos, posteriores", "Coxas e glúteos"],
  ["Leg press 45°", "Quadríceps", "Glúteos, posteriores", "Coxas"],
  ["Cadeira extensora", "Quadríceps", "", "Parte frontal da coxa"],
  ["Mesa flexora", "Posteriores", "Glúteos", "Parte posterior da coxa"],
  ["Levantamento terra romeno", "Posteriores", "Glúteos, lombar", "Posteriores da coxa"],
  ["Hip thrust", "Glúteos", "Posteriores", "Glúteos"],
  ["Panturrilha em pé", "Panturrilhas", "", "Panturrilhas"],
  ["Prancha abdominal", "Core", "Abdômen, ombros", "Abdômen e tronco"],
  ["Abdominal na máquina", "Abdômen", "Core", "Abdômen"],
  ["Flexão de braços", "Peito", "Tríceps, ombros", "Peitoral"],
  ["Agachamento com peso corporal", "Quadríceps", "Glúteos, posteriores", "Coxas e glúteos"],
  ["Avanço com peso corporal", "Quadríceps", "Glúteos, posteriores", "Coxas e glúteos"],
  ["Alongamento de peitoral", "Peito", "Ombros", "Peitoral"],
  ["Alongamento de quadríceps", "Quadríceps", "", "Parte frontal da coxa"],
  ["Mobilidade de quadril", "Mobilidade", "Glúteos, adutores", "Quadril"],
  ["Bicicleta ergométrica", "Cardio", "Pernas", "Condicionamento cardiovascular"],
  ["Esteira", "Cardio", "Pernas", "Condicionamento cardiovascular"],
  ["Elíptico", "Cardio", "Pernas, braços", "Condicionamento cardiovascular"]
] as const;

function starterClassification(name: string, muscleGroup: string): { bodyRegion: BodyRegion; phase: ExercisePhase; exerciseType: ExerciseType } {
  if (["Alongamento de peitoral", "Alongamento de quadríceps", "Mobilidade de quadril"].includes(name)) return { bodyRegion: muscleGroup === "Peito" ? "Tronco anterior" : "Membros inferiores", phase: "Preparação", exerciseType: "Alongamento" };
  if (["Prancha abdominal", "Abdominal na máquina"].includes(name)) return { bodyRegion: "Região central", phase: "Treino principal", exerciseType: name.startsWith("Prancha") ? "Peso corporal" : "Força" };
  if (["Bicicleta ergométrica", "Esteira", "Elíptico"].includes(name)) return { bodyRegion: "Membros inferiores", phase: "Cardio", exerciseType: "Cardio" };
  if (["Flexão de braços", "Agachamento com peso corporal", "Avanço com peso corporal"].includes(name)) return { bodyRegion: muscleGroup === "Peito" ? "Tronco anterior" : "Membros inferiores", phase: "Treino principal", exerciseType: "Peso corporal" };
  if (["Puxada frontal", "Remada baixa", "Remada unilateral com halter", "Levantamento terra romeno", "Mesa flexora"].includes(name)) return { bodyRegion: "Tronco posterior", phase: "Treino principal", exerciseType: "Força" };
  if (["Supino reto com barra", "Supino inclinado com halteres", "Crucifixo na máquina", "Desenvolvimento com halteres", "Elevação lateral", "Face pull", "Rosca direta com barra", "Rosca alternada com halteres", "Rosca martelo", "Tríceps na polia", "Tríceps francês", "Rosca de punho"].includes(name)) return { bodyRegion: muscleGroup === "Peito" ? "Tronco anterior" : "Membros superiores", phase: "Treino principal", exerciseType: "Força" };
  return { bodyRegion: "Membros inferiores", phase: "Treino principal", exerciseType: "Força" };
}

export default function Home() {
  const access = useAccess();
  const accountRole: Role = access.role === "admin" ? "gestao" : access.role === "teacher" ? "professor" : "aluno";
  const [demoRole, setDemoRole] = useState<Role>(accountRole);
  const role = access.accountType === "developer" ? demoRole : accountRole;
  const [theme, setTheme] = useState<Theme>("bronze");
  const [activeTab, setActiveTab] = useState<StudentTab>("inicio");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutRecord | null>(null);
  const [completedSets, setCompletedSets] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("orquestra_fit_theme");
    const restoredTheme: Theme = savedTheme === "prata" || savedTheme === "ferro" ? "prata" : "bronze";
    const restoreTheme = window.setTimeout(() => setTheme(restoredTheme), 0);
    return () => window.clearTimeout(restoreTheme);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("orquestra_fit_theme", theme);
  }, [theme]);

  function announce(message: string) {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 2600);
  }

  return (
    <FeedbackContext.Provider value={announce}>
      <main
        className={role === "aluno" ? "v3-page" : "v3-page desktop-mode"}
        data-theme={theme === "prata" ? "ferro" : "forja"}
      >
        <div className="prototype-flag"><Sparkles size={14} /> {access.accountType === "developer" ? "Ambiente interno de testes" : "Ambiente da academia"}</div>
        {access.accountType === "developer" && (
          <RoleSwitcher role={demoRole} onChange={(nextRole) => { setDemoRole(nextRole); setSessionOpen(false); setMenuOpen(false); }} />
        )}
        {role === "aluno" && (
        <section className={sessionOpen ? "student-app session-active" : "student-app"}>
          {sessionOpen ? (
            <WorkoutSession
              workout={activeWorkout ?? undefined}
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
                {activeTab === "inicio" && <StudentHome onStart={(workout) => { setActiveWorkout(workout ?? null); setCompletedSets([]); setSessionOpen(true); }} onEvolution={() => setActiveTab("evolucao")} />}
                {activeTab === "treinos" && <WorkoutLibrary onStart={(workout) => { setActiveWorkout(workout ?? null); setCompletedSets([]); setSessionOpen(true); }} />}
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
        {role === "gestao" && <AdminWorkspace theme={theme} onThemeChange={setTheme} />}
        {feedback && <div className="action-feedback" role="status">{feedback}</div>}
      </main>
    </FeedbackContext.Provider>
  );
}

function ThemeSwitcher({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const themes: { id: Theme; label: string }[] = [
    { id: "bronze", label: "Bronze" },
    { id: "prata", label: "Prata" },
  ];
  return (
    <div className="theme-switcher" aria-label="Escolher tema">
      <Palette aria-hidden="true" />
      {themes.map((item) => (
        <button
          key={item.id}
          className={theme === item.id ? `theme-choice ${item.id} active` : `theme-choice ${item.id}`}
          aria-label={item.label}
          title={item.label}
          onClick={() => onChange(item.id)}
        >
          <i aria-hidden="true" />
          <span>{item.label}</span>
        </button>
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
  const feedback = useFeedback();
  return (
    <header className="student-header">
      <AcademyBrand />
      <div className="header-actions">
        <button aria-label="Notificações" className="icon-button" onClick={() => feedback("Você não tem novas notificações.")}><Bell size={20} /><i /></button>
        <button aria-label="Abrir menu" className="icon-button bronze" onClick={onMenu}><Menu size={22} /></button>
      </div>
    </header>
  );
}

function AcademyBrand() {
  return (
    <div className="academy-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/dama-de-ferro.jpeg" alt="Dama de Ferro Academia" />
      <div><span>Dama de Ferro</span><small>Academia</small></div>
    </div>
  );
}

function StudentHome({ onStart, onEvolution }: { onStart: (workout?: WorkoutRecord) => void; onEvolution: () => void }) {
  const access = useAccess();
  return (
    <div className="student-view home-view">
      <section className="welcome-row">
        <div><p>SEGUNDA, 1 DE SETEMBRO</p><h1>Olá, {firstName(access.user.displayName, access.user.email)}.</h1><span>Seu ritmo começa aqui.</span></div>
        <div className="streak" aria-label="Sequência de treinos"><Flame size={20} /><strong>4</strong><small>semanas</small></div>
      </section>

      <article className="today-workout">
        <div className="workout-copy">
          <div className="eyebrow"><span /> TREINO DE HOJE</div>
          <h2>Força A</h2>
          <p>Pernas e estabilidade</p>
          <div className="workout-meta">
            <span><Clock3 size={16} /> 52 min</span>
            <span><Dumbbell size={16} /> 8 exercícios</span>
          </div>
          <button onClick={() => onStart()}>Iniciar treino <ArrowRight size={19} /></button>
        </div>
        <div className="workout-art" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dama-de-ferro.jpeg" alt="" />
        </div>
        <span className="steel-number">01</span>
      </article>

      <section className="status-grid">
        <StudentPaymentStatus />
        <article role="button" tabIndex={0} onClick={() => onEvolution()}>
          <span className="status-icon"><Activity /></span>
          <div><small>Frequência</small><strong>9 visitas</strong><p>Meta: 12 no mês</p></div>
          <div className="mini-progress"><i /></div>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div><span>SEU DESEMPENHO</span><h2>Semana em movimento</h2></div><button onClick={onEvolution}>Ver detalhes</button>
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

function StudentPaymentStatus() {
  const access = useAccess();
  const feedback = useFeedback();
  const [charges, setCharges] = useState<MonthlyCharge[]>([]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, "academies", access.academyId, "monthlyCharges"), where("studentId", "==", access.userId)), (snapshot) => {
      setCharges(snapshot.docs.map((charge) => {
        const data = charge.data() as Omit<MonthlyCharge, "id">;
        const status: MonthlyCharge["status"] = data.status === "paid" ? "paid" : "pending";
        return { id: charge.id, ...data, amount: Number(data.amount ?? 0), status };
      }).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    }, (error) => console.error("Não foi possível carregar o status financeiro do aluno.", error));
  }, [access.academyId, access.userId]);

  const charge = charges.find((item) => item.status !== "paid") ?? charges[0];
  const status = charge ? chargeViewStatus(charge) : "paid";
  const detail = !charge ? "Nenhuma cobrança registrada" : status === "paid" ? "Nenhuma pendência no momento" : status === "overdue" ? `Vencida há ${Math.abs(daysUntil(charge.dueDate))} dias` : daysUntil(charge.dueDate) === 0 ? "Vence hoje" : `Vence em ${daysUntil(charge.dueDate)} dias`;

  return (
    <article className={`student-payment-status ${status}`} role="button" tabIndex={0} onClick={() => feedback(charge ? `${charge.planName}: ${chargeStatusLabel(status)}.` : "A academia ainda não lançou uma mensalidade.")}>
      <span className="status-icon"><ShieldCheck /></span>
      <div><small>Mensalidade</small><strong>{charge ? chargeStatusLabel(status) : "Sem cobrança"}</strong><p>{detail}</p></div><ChevronRight />
    </article>
  );
}

function WorkoutLibrary({ onStart }: { onStart: (workout?: WorkoutRecord) => void }) {
  const access = useAccess();
  const [publishedWorkouts, setPublishedWorkouts] = useState<WorkoutRecord[]>([]);
  useEffect(() => {
    if (!db) return;
    const workoutsQuery = query(collection(db, "academies", access.academyId, "workouts"), where("studentId", "==", access.userId), where("status", "==", "published"));
    return onSnapshot(workoutsQuery, (snapshot) => {
      setPublishedWorkouts(snapshot.docs.map((workout) => { const data = workout.data() as Omit<WorkoutRecord, "id">; return { id: workout.id, ...data, exerciseIds: data.exerciseIds ?? [], exerciseDetails: data.exerciseDetails ?? [], status: "published" }; }));
    }, (error) => console.error("Não foi possível carregar os treinos.", error));
  }, [access.academyId, access.userId]);
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
        {publishedWorkouts.length > 0 ? publishedWorkouts.map((workout, index) => (
          <button key={workout.id} className={index === 0 ? "active" : ""} onClick={() => onStart(workout)}>
            <span className="workout-index">0{index + 1}</span><div><small>{index === 0 ? "PROGRAMADO PARA HOJE" : "TREINO PUBLICADO"}</small><strong>{workout.name}</strong><p>{workout.exerciseIds.length} exercícios</p></div><span className="play-button"><Play size={18} fill="currentColor" /></span>
          </button>
        )) : plans.map((plan, index) => (
          <button key={plan.title} className={plan.active ? "active" : ""} onClick={() => onStart()}>
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
  const access = useAccess();
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [executions, setExecutions] = useState<WorkoutExecution[]>([]);
  useEffect(() => {
    if (!db) return;
    const assessmentQuery = query(collection(db, "academies", access.academyId, "assessments"), where("studentId", "==", access.userId));
    const executionQuery = query(collection(db, "academies", access.academyId, "workoutExecutions"), where("studentId", "==", access.userId));
    const unsubscribeAssessments = onSnapshot(assessmentQuery, (snapshot) => {
      setAssessments(snapshot.docs.map((item) => { const data = item.data() as Omit<AssessmentRecord, "id">; return { id: item.id, ...data }; }).sort((a, b) => b.date.localeCompare(a.date)));
    }, (error) => console.error("Não foi possível carregar a avaliação.", error));
    const unsubscribeExecutions = onSnapshot(executionQuery, (snapshot) => {
      setExecutions(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<WorkoutExecution, "id">) })).sort((a, b) => (b.completedAt?.toDate?.().getTime() ?? 0) - (a.completedAt?.toDate?.().getTime() ?? 0)));
    }, (error) => console.error("Não foi possível carregar o histórico de treinos.", error));
    return () => { unsubscribeAssessments(); unsubscribeExecutions(); };
  }, [access.academyId, access.userId]);
  const latestAssessment = assessments[0] ?? null;
  const previousAssessment = assessments[1] ?? null;
  const comparisonMetrics: Array<{ label: string; key: "weight" | "bodyFat" | "biceps" | "waist" | "chest" | "thigh"; unit: string }> = [
    { label: "Peso", key: "weight", unit: "kg" },
    { label: "Gordura corporal", key: "bodyFat", unit: "%" },
    { label: "Bíceps", key: "biceps", unit: "cm" },
    { label: "Cintura", key: "waist", unit: "cm" },
    { label: "Peito", key: "chest", unit: "cm" },
    { label: "Coxa", key: "thigh", unit: "cm" }
  ];
  function assessmentValue(assessment: AssessmentRecord | null, key: typeof comparisonMetrics[number]["key"]) {
    const value = assessment?.[key];
    return value ? Number(value.replace(",", ".")) : null;
  }
  function assessmentDelta(key: typeof comparisonMetrics[number]["key"]) {
    const current = assessmentValue(latestAssessment, key);
    const previous = assessmentValue(previousAssessment, key);
    if (current === null || previous === null) return null;
    return current - previous;
  }
  const bestLoads = Array.from(executions.flatMap((execution) => execution.sets ?? []).reduce((records, item) => {
    const load = Number(item.load.replace(",", ".")) || 0;
    const current = records.get(item.exerciseName);
    if (!current || load > current.load) records.set(item.exerciseName, { ...item, load });
    return records;
  }, new Map<string, { exerciseName: string; setNumber: number; load: number; reps: string }>()).values()).slice(0, 3);
  return (
    <div className="student-view">
      <PageIntro kicker="ACOMPANHAMENTO" title="Sua evolução" copy="Consistência que aparece nos números." />
      <div className="evolution-hero"><span>TREINOS CONCLUÍDOS</span><strong>{executions.length}</strong><p>{executions.length === 1 ? "1 treino registrado" : `${executions.length} treinos registrados`}</p><div><i style={{ width: `${Math.min(executions.length * 12, 100)}%` }} /></div></div>
      <section className="evolution-grid">
        <article><Trophy /><small>Último treino</small><strong>{executions[0]?.workoutName ?? "—"}</strong><p>{executions[0] ? `${executions[0].completedSets} séries concluídas` : "Ainda sem execução registrada"}</p></article>
        <article><Activity /><small>Séries concluídas</small><strong>{executions.reduce((total, item) => total + item.completedSets, 0)}</strong><p>Registradas nos seus treinos</p></article>
      </section>
      <section className="assessment-comparison">
        <div className="section-heading"><div><span>AVALIAÇÃO FÍSICA</span><h2>Seu progresso</h2></div><small>{latestAssessment ? formatDate(latestAssessment.date) : "Sem avaliação"}</small></div>
        {!latestAssessment ? <div className="directory-empty"><Activity /><p>Faça uma avaliação física para acompanhar suas medidas.</p></div> : <>
          <div className="assessment-summary"><strong>{latestAssessment.weight} kg</strong><span>Peso atual</span><p>{previousAssessment ? `Comparação com ${formatDate(previousAssessment.date)}` : "Primeira avaliação registrada"}</p></div>
          <div className="comparison-list">{comparisonMetrics.map((metric) => {
            const current = assessmentValue(latestAssessment, metric.key);
            const delta = assessmentDelta(metric.key);
            return <div className="comparison-row" key={metric.key}><div><strong>{metric.label}</strong><small>{current === null ? "Não informado" : `${current} ${metric.unit}`}</small></div><span className={delta === null ? "comparison-neutral" : delta > 0 ? "comparison-up" : delta < 0 ? "comparison-down" : "comparison-neutral"}>{delta === null ? "Sem comparação" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${metric.unit}`}</span></div>;
          })}</div>
        </>}
      </section>
      <section className="history-panel">
        <div className="section-heading"><div><span>HISTÓRICO</span><h2>Últimos registros</h2></div></div>
        {bestLoads.length === 0 ? <div className="directory-empty"><Dumbbell /><p>Conclua um treino para ver suas cargas registradas aqui.</p></div> : bestLoads.map((item) => (
          <div className="history-row" key={item.exerciseName}><span>{item.exerciseName}</span><strong>{item.load > 0 ? `${item.load} kg` : "Sem carga"}</strong><small>{item.reps} rep · melhor carga</small></div>
        ))}
      </section>
      <article className="latest-assessment"><span>ALTURA REGISTRADA</span>{latestAssessment ? <><strong>{latestAssessment.height} cm</strong><p>{latestAssessment.notes || "Medidas registradas pela equipe."}</p></> : <><strong>Ainda não registrada</strong><p>Peça uma avaliação física à equipe da academia.</p></>}</article>
    </div>
  );
}

function Agenda() {
  const access = useAccess();
  const feedback = useFeedback();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [reservationIds, setReservationIds] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState(0);
  useEffect(() => {
    if (!db) return;
    const unsubscribeClasses = onSnapshot(collection(db, "academies", access.academyId, "classes"), (snapshot) => {
      setClasses(snapshot.docs.map((item) => { const data = item.data() as Partial<ClassRecord>; return { id: item.id, name: data.name ?? "Aula", instructor: data.instructor ?? "Equipe", date: data.date ?? "", time: data.time ?? "", capacity: Number(data.capacity ?? 10), active: data.active !== false }; }).filter((item) => item.active));
    });
    const reservationQuery = query(collection(db, "academies", access.academyId, "reservations"), where("studentId", "==", access.userId), where("status", "==", "active"));
    const unsubscribeReservations = onSnapshot(reservationQuery, (snapshot) => setReservationIds(snapshot.docs.map((item) => (item.data() as { classId: string }).classId)));
    return () => { unsubscribeClasses(); unsubscribeReservations(); };
  }, [access.academyId, access.userId]);

  async function reserve(item: ClassRecord) {
    if (!db) return;
    try {
      await addDoc(collection(db, "academies", access.academyId, "reservations"), { classId: item.id, className: item.name, studentId: access.userId, studentName: accountName(access.user.displayName, access.user.email), status: "active", createdAt: serverTimestamp() });
      feedback("Reserva confirmada.");
    } catch { feedback("Não foi possível reservar esta aula."); }
  }

  async function cancel(item: ClassRecord) {
    if (!db) return;
    const firestore = db;
    try {
      const reservationSnapshot = await new Promise<string | null>((resolve) => {
        const unsubscribe = onSnapshot(query(collection(firestore, "academies", access.academyId, "reservations"), where("classId", "==", item.id), where("studentId", "==", access.userId), where("status", "==", "active")), (snapshot) => { unsubscribe(); resolve(snapshot.docs[0]?.id ?? null); });
      });
      if (reservationSnapshot) await updateDoc(doc(firestore, "academies", access.academyId, "reservations", reservationSnapshot), { status: "canceled" });
      feedback("Reserva cancelada.");
    } catch { feedback("Não foi possível cancelar a reserva."); }
  }

  return (
    <div className="student-view">
      <PageIntro kicker="AULAS E RESERVAS" title="Sua agenda" copy="Organize a semana sem perder o ritmo." />
      <div className="date-selector">{["SEG\n01", "TER\n02", "QUA\n03", "QUI\n04", "SEX\n05"].map((day, index) => <button className={selectedDay === index ? "active" : ""} key={day} onClick={() => setSelectedDay(index)}>{day.split("\n").map((part) => <span key={part}>{part}</span>)}</button>)}</div>
      {classes.length === 0 ? <div className="empty-agenda"><CalendarDays /><h3>Nenhuma aula disponível</h3><p>As próximas turmas da academia aparecerão aqui.</p></div> : classes.map((item) => { const reserved = reservationIds.includes(item.id); return <article className="class-card" key={item.id}><div className="class-time"><strong>{item.time}</strong><span>{item.capacity} vagas</span></div><div><small>{item.name.toUpperCase()}</small><h2>{item.name}</h2><p>{item.instructor} · {item.date}</p></div><button onClick={() => reserved ? cancel(item) : reserve(item)}>{reserved ? "Cancelar reserva" : "Reservar"}</button></article>; })}
    </div>
  );
}

function Profile() {
  const access = useAccess();
  const links = [
    { icon: User, label: "Dados pessoais" },
    { icon: WalletCards, label: "Plano e mensalidades" },
    { icon: Activity, label: "Avaliações físicas" },
    { icon: ShieldCheck, label: "Privacidade e segurança" },
  ];
  return (
    <div className="student-view profile-view">
      <div className="profile-identity"><span>{firstName(access.user.displayName, access.user.email).slice(0, 2).toUpperCase()}</span><small>ALUNO</small><h1>{accountName(access.user.displayName, access.user.email)}</h1><p>Conta vinculada à academia</p></div>
      {links.map(({ icon: Icon, label }) => <button className="profile-link" key={label}><Icon /><span>{label}</span><ChevronRight /></button>)}
      <div className="powered-by"><span>Plataforma</span><strong>Orquestra Fit</strong><small>acesso protegido por código</small></div>
      <button className="profile-link" type="button" onClick={() => void logout()}><ShieldCheck /><span>Sair com segurança</span><ChevronRight /></button>
    </div>
  );
}

function WorkoutSession({ workout, completedSets, onBack, onToggleSet }: { workout?: WorkoutRecord; completedSets: string[]; onBack: () => void; onToggleSet: (id: string) => void }) {
  const access = useAccess();
  const feedback = useFeedback();
  const exercises = workout?.exerciseDetails?.length ? workout.exerciseDetails.map((exercise) => ({ name: exercise.name, group: exercise.muscleGroup || "Treino", anatomyRegion: exercise.anatomyRegion, instructions: exercise.instructions, videoUrl: exercise.videoUrl, sets: Number(exercise.sets) || 1, reps: exercise.reps || "10", load: exercise.load || "0", rest: `${exercise.rest || "60"} s` })) : workoutPlan;
  const totalSets = exercises.reduce((sum, item) => sum + item.sets, 0);
  const progress = Math.round((completedSets.length / totalSets) * 100);
  const [seconds, setSeconds] = useState(0);
  const [setValues, setSetValues] = useState<Record<string, { load: string; reps: string }>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, [seconds]);

  async function finishWorkout() {
    if (completedSets.length < totalSets || saving) return;
    if (!workout || !db) {
      feedback("Treino concluído.");
      onBack();
      return;
    }
    setSaving(true);
    try {
      const sets = exercises.flatMap((exercise, exerciseIndex) => Array.from({ length: exercise.sets }).map((_, setIndex) => {
        const id = `${exerciseIndex}-${setIndex}`;
        const value = setValues[id] ?? { load: exercise.load, reps: exercise.reps };
        return { exerciseName: exercise.name, setNumber: setIndex + 1, load: value.load, reps: value.reps };
      }));
      await addDoc(collection(db, "academies", access.academyId, "workoutExecutions"), {
        workoutId: workout.id,
        workoutName: workout.name,
        studentId: access.userId,
        durationSeconds: seconds,
        completedSets: completedSets.length,
        totalSets,
        sets,
        completedAt: serverTimestamp(),
      });
      feedback("Treino concluído e salvo no seu histórico.");
      onBack();
    } catch {
      feedback("Não foi possível salvar este treino. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="session-view">
      <header className="session-top">
        <button aria-label="Voltar" onClick={onBack}><ArrowLeft /></button>
        <div><small>TREINO EM ANDAMENTO</small><strong>{elapsed}</strong></div><span>{progress}%</span>
      </header>
      <section className="session-title">
        <div><span>{workout ? "TREINO PUBLICADO" : "FORÇA A"}</span><h1>{workout?.name ?? "Pernas e estabilidade"}</h1><p>{completedSets.length} de {totalSets} séries concluídas</p></div>
        <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><strong>{progress}%</strong></div>
      </section>
      <div className="session-exercises">
        {exercises.map((exercise, exerciseIndex) => (
          <article className="exercise-card" key={exercise.name}>
            <header><span>0{exerciseIndex + 1}</span><div><small>{exercise.group}</small><h2>{exercise.name}</h2></div><button aria-label="Ver demonstração"><Play size={17} fill="currentColor" /></button></header>
            {("instructions" in exercise && (exercise.instructions || exercise.anatomyRegion || exercise.videoUrl)) && <div className="exercise-guidance"><strong>{exercise.anatomyRegion || exercise.group}</strong>{exercise.instructions && <p><b>Como executar:</b> {exercise.instructions}</p>}{exercise.videoUrl && <a href={exercise.videoUrl} target="_blank" rel="noreferrer">Assistir demonstração</a>}</div>}
            <div className="set-labels"><span>Série</span><span>Carga</span><span>Repetições</span><span>Feito</span></div>
            {Array.from({ length: exercise.sets }).map((_, setIndex) => {
              const id = `${exerciseIndex}-${setIndex}`;
              const done = completedSets.includes(id);
              return (
                <div className={done ? "set-row done" : "set-row"} key={id}>
                  <strong>{setIndex + 1}</strong>
                  <label><input value={setValues[id]?.load ?? exercise.load} onChange={(event) => setSetValues((current) => ({ ...current, [id]: { load: event.target.value, reps: current[id]?.reps ?? exercise.reps } }))} inputMode="numeric" aria-label="Carga" /><span>kg</span></label>
                  <label><input value={setValues[id]?.reps ?? exercise.reps} onChange={(event) => setSetValues((current) => ({ ...current, [id]: { load: current[id]?.load ?? exercise.load, reps: event.target.value } }))} inputMode="numeric" aria-label="Repetições" /><span>rep</span></label>
                  <button aria-label={`Concluir série ${setIndex + 1}`} onClick={() => onToggleSet(id)}>{done && <Check size={18} />}</button>
                </div>
              );
            })}
            <footer><Clock3 size={16} /> Descanso recomendado: <strong>{exercise.rest}</strong></footer>
          </article>
        ))}
      </div>
      <button className="finish-workout" disabled={completedSets.length < totalSets || saving} onClick={finishWorkout}><Trophy size={20} /> {saving ? "Salvando treino..." : "Concluir treino"}</button>
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

type RegisteredStudent = {
  id: string;
  name: string;
  email?: string | null;
  plan: string;
  teacherId?: string | null;
  active?: boolean;
};

type RegisteredTeacher = {
  id: string;
  name: string;
  email?: string | null;
  active?: boolean;
};

function WorkspaceShell({ children, profile, theme, onThemeChange, onNewStudent }: { children: React.ReactNode; profile: "Gestão" | "Professor"; theme?: Theme; onThemeChange?: (theme: Theme) => void; onNewStudent?: () => void }) {
  const access = useAccess();
  const operatorName = accountName(access.user.displayName, access.user.email);
  const operatorInitials = operatorName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const feedback = useFeedback();
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [activeModule, setActiveModule] = useState("Visão geral");
  const visibleNav = profile === "Professor"
    ? workspaceNav.filter(([label]) => ["Visão geral", "Alunos", "Treinos", "Avaliações"].includes(label))
    : workspaceNav;
  return (
    <section className="workspace-shell">
      <aside className="workspace-rail">
        <AcademyBrand />
        <nav>
          {visibleNav.map(([label, Icon]) => (
            <button key={label} className={activeModule === label ? "active" : ""} onClick={() => setActiveModule(label)}><Icon /><span>{label}</span></button>
          ))}
        </nav>
        {profile === "Gestão" && <button className="rail-settings" onClick={() => setPermissionsOpen(true)}><Settings /><span>Configurações</span></button>}
        <div className="rail-powered"><small>PLATAFORMA</small><strong>Orquestra Fit</strong></div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div><span>DAMA DE FERRO ACADEMIA</span><h1>{activeModule === "Visão geral" ? (profile === "Gestão" ? "Visão geral" : "Área do professor") : activeModule}</h1></div>
          <div className="workspace-actions">
            <button aria-label="Buscar"><Search /></button>
            <button aria-label="Notificações"><Bell /></button>
            <button className="operator" type="button" onClick={() => void logout()} title="Sair da conta"><span>{operatorInitials}</span><div><strong>{operatorName}</strong><small>{profile} · sair</small></div></button>
          </div>
        </header>
        {activeModule === "Visão geral" ? children : activeModule === "Alunos" ? <StudentsModule onNewStudent={onNewStudent} onFeedback={feedback} /> : activeModule === "Professores" ? <TeachersModule onFeedback={feedback} /> : activeModule === "Planos e mensalidades" ? <BillingModule onFeedback={feedback} /> : activeModule === "Treinos" ? <TrainingModule onFeedback={feedback} /> : activeModule === "Aulas e reservas" ? <ClassesModule onFeedback={feedback} /> : activeModule === "Avaliações" ? <AssessmentsModule onFeedback={feedback} /> : <WorkspaceModule title={activeModule} profile={profile} onFeedback={feedback} />}
      </div>
      {permissionsOpen && theme && onThemeChange && <PermissionsPanel theme={theme} onThemeChange={onThemeChange} onClose={() => setPermissionsOpen(false)} onFeedback={feedback} />}
    </section>
  );
}

type AcademyPlan = { id: string; name: string; price: number; interval: string; active: boolean };
type BillingStudent = { id: string; name: string; active: boolean; teacherId?: string | null };
type BillingPlan = { id: string; name: string; price: number; active: boolean };
type PaymentMethod = "pix" | "maquininha" | "dinheiro" | "transferencia" | "boleto";
type ChargeType = "monthly" | "registration" | "service";
type MonthlyCharge = { id: string; studentId: string; studentName: string; planName: string; amount: number; dueDate: string; status: "pending" | "paid"; paymentMethod?: PaymentMethod; chargeType?: ChargeType };
type BodyRegion = "Membros superiores" | "Tronco anterior" | "Tronco posterior" | "Região central" | "Membros inferiores";
type ExercisePhase = "Preparação" | "Treino principal" | "Cardio" | "Finalização";
type ExerciseType = "Força" | "Peso corporal" | "Alongamento" | "Cardio";
type ExerciseRecord = { id: string; name: string; muscleGroup: string; secondaryMuscles?: string; anatomyRegion?: string; instructions?: string; videoUrl?: string; bodyRegion?: BodyRegion; phase?: ExercisePhase; exerciseType?: ExerciseType };
type WorkoutExerciseDetail = { exerciseId: string; name: string; sets: string; reps: string; load: string; rest: string; muscleGroup?: string; secondaryMuscles?: string; anatomyRegion?: string; instructions?: string; videoUrl?: string; bodyRegion?: BodyRegion; phase?: ExercisePhase; exerciseType?: ExerciseType };
type WorkoutRecord = { id: string; name: string; studentId: string; studentName: string; exerciseIds: string[]; exerciseDetails?: WorkoutExerciseDetail[]; status: "draft" | "published" };
type WorkoutTemplateRecord = { id: string; name: string; exerciseIds: string[]; exerciseDetails: WorkoutExerciseDetail[]; createdBy: string };
type ClassRecord = { id: string; name: string; instructor: string; date: string; time: string; capacity: number; active: boolean };
type AssessmentRecord = { id: string; studentId: string; studentName: string; date: string; weight: string; height: string; bodyFat: string; biceps?: string; waist?: string; chest?: string; thigh?: string; notes: string };
type WorkoutExecution = { id: string; workoutId: string; workoutName: string; studentId: string; durationSeconds: number; completedSets: number; totalSets: number; sets: Array<{ exerciseName: string; setNumber: number; load: string; reps: string }>; completedAt?: { toDate?: () => Date } };

type ChargeViewStatus = "paid" | "overdue" | "dueSoon" | "pending";

function todayIso() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysUntil(dateString: string) {
  if (!dateString) return 0;
  const [year, month, day] = dateString.split("-").map(Number);
  const due = Date.UTC(year, (month || 1) - 1, day || 1);
  const today = todayIso().split("-").map(Number);
  return Math.round((due - Date.UTC(today[0], today[1] - 1, today[2])) / 86400000);
}

function chargeViewStatus(charge: Pick<MonthlyCharge, "status" | "dueDate">): ChargeViewStatus {
  if (charge.status === "paid") return "paid";
  const days = daysUntil(charge.dueDate);
  if (days < 0) return "overdue";
  if (days <= 7) return "dueSoon";
  return "pending";
}

function chargeStatusLabel(status: ChargeViewStatus) {
  return status === "paid" ? "Paga" : status === "overdue" ? "Vencida" : status === "dueSoon" ? "Vence em breve" : "Pendente";
}

function formatDate(dateString: string) {
  if (!dateString) return "Sem vencimento";
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

function AssessmentsModule({ onFeedback }: { onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [students, setStudents] = useState<BillingStudent[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [studentId, setStudentId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [date, setDate] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [biceps, setBiceps] = useState("");
  const [waist, setWaist] = useState("");
  const [chest, setChest] = useState("");
  const [thigh, setThigh] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    const unsubscribeStudents = onSnapshot(collection(db, "academies", access.academyId, "students"), (snapshot) => setStudents(snapshot.docs.map((student) => { const data = student.data() as { name?: string; active?: boolean }; return { id: student.id, name: data.name ?? "Aluno sem nome", active: data.active !== false }; })));
    const unsubscribeAssessments = onSnapshot(collection(db, "academies", access.academyId, "assessments"), (snapshot) => setAssessments(snapshot.docs.map((item) => { const data = item.data() as Omit<AssessmentRecord, "id">; return { id: item.id, ...data }; }).sort((a, b) => b.date.localeCompare(a.date))));
    return () => { unsubscribeStudents(); unsubscribeAssessments(); };
  }, [access.academyId]);

  async function createAssessment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !studentId || !date || !weight || !height) return;
    const student = students.find((item) => item.id === studentId);
    if (!student) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "academies", access.academyId, "assessments"), { studentId, studentName: student.name, date, weight, height, bodyFat, biceps, waist, chest, thigh, notes, createdBy: access.userId, createdAt: serverTimestamp() });
      setStudentId(""); setDate(""); setWeight(""); setHeight(""); setBodyFat(""); setBiceps(""); setWaist(""); setChest(""); setThigh(""); setNotes(""); onFeedback("Avaliação física registrada.");
    } catch { onFeedback("Não foi possível registrar a avaliação."); }
    finally { setSaving(false); }
  }

  const selectedAssessments = assessments.filter((item) => item.studentId === selectedStudentId);
  const selectedLatest = selectedAssessments[0] ?? null;
  const selectedPrevious = selectedAssessments[1] ?? null;
  const selectedDelta = (key: "weight" | "bodyFat" | "biceps" | "waist" | "chest" | "thigh") => {
    const current = selectedLatest?.[key] ? Number(selectedLatest[key]!.replace(",", ".")) : null;
    const previous = selectedPrevious?.[key] ? Number(selectedPrevious[key]!.replace(",", ".")) : null;
    return current !== null && previous !== null ? current - previous : null;
  };

  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro"><div><span>EVOLUÇÃO · GESTÃO</span><h2>Avaliações físicas</h2><p>Registre medidas básicas e acompanhe a evolução dos alunos.</p></div></section>
      <section className="assessment-layout"><article className="workspace-panel plan-form-panel"><header><div><span>NOVA AVALIAÇÃO</span><h3>Registrar medidas</h3></div></header><form className="student-detail-form" onSubmit={createAssessment}><label>Aluno<select value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="">Selecione um aluno</option>{students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><div className="measurement-grid"><label>Peso (kg)<input value={weight} onChange={(event) => setWeight(event.target.value)} inputMode="decimal" placeholder="72,5" required /></label><label>Altura (cm)<input value={height} onChange={(event) => setHeight(event.target.value)} inputMode="numeric" placeholder="175" required /></label><label>Gordura (%)<input value={bodyFat} onChange={(event) => setBodyFat(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label><label>Bíceps (cm)<input value={biceps} onChange={(event) => setBiceps(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label><label>Cintura (cm)<input value={waist} onChange={(event) => setWaist(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label><label>Peito (cm)<input value={chest} onChange={(event) => setChest(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label><label>Coxa (cm)<input value={thigh} onChange={(event) => setThigh(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label></div><label>Observações<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observações do professor" /></label><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar avaliação"}</button></form></article><article className="workspace-panel plans-list-panel"><header><div><span>HISTÓRICO</span><h3>{assessments.length} {assessments.length === 1 ? "avaliação" : "avaliações"}</h3></div></header><label className="assessment-filter">Ver evolução de<select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}><option value="">Selecione um aluno</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><div className="assessment-list">{assessments.length === 0 ? <div className="directory-empty"><Activity /><p>Nenhuma avaliação registrada ainda.</p></div> : assessments.map((item) => <button className="assessment-row assessment-row-button" key={item.id} onClick={() => setSelectedStudentId(item.studentId)}><div><strong>{item.studentName}</strong><small>{item.date} · {item.weight} kg · {item.height} cm{item.biceps ? ` · Bíceps ${item.biceps} cm` : ""}</small></div><span>{item.bodyFat ? `${item.bodyFat}% gordura` : "Medidas básicas"}</span></button>)}</div>{selectedLatest && <div className="staff-assessment-detail"><span>COMPARAÇÃO DO ALUNO</span><strong>{selectedLatest.studentName}</strong><small>{selectedPrevious ? `${formatDate(selectedPrevious.date)} → ${formatDate(selectedLatest.date)}` : "Primeira avaliação registrada"}</small><div className="staff-measure-grid">{([ ["Peso", "weight", "kg"], ["Gordura", "bodyFat", "%"], ["Bíceps", "biceps", "cm"], ["Cintura", "waist", "cm"] ] as const).map(([label, key, unit]) => { const value = selectedLatest[key] ? `${selectedLatest[key]} ${unit}` : "Não informado"; const delta = selectedDelta(key); return <div key={key}><small>{label}</small><strong>{value}</strong><span>{delta === null ? "Sem comparação" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${unit}`}</span></div>; })}</div></div>}</article></section>
    </div>
  );
}

function ClassesModule({ onFeedback }: { onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [name, setName] = useState("");
  const [instructor, setInstructor] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, "academies", access.academyId, "classes"), (snapshot) => {
      setClasses(snapshot.docs.map((item) => {
        const data = item.data() as Partial<ClassRecord>;
        return { id: item.id, name: data.name ?? "Aula", instructor: data.instructor ?? "Equipe", date: data.date ?? "", time: data.time ?? "", capacity: Number(data.capacity ?? 10), active: data.active !== false };
      }).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)));
    }, (error) => console.error("Não foi possível carregar as aulas.", error));
  }, [access.academyId]);

  async function createClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !name.trim() || !date || !time) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "academies", access.academyId, "classes"), { name: name.trim(), instructor: instructor.trim() || "Equipe da academia", date, time, capacity: Number(capacity) || 10, active: true, createdBy: access.userId, createdAt: serverTimestamp() });
      setName(""); setInstructor(""); setDate(""); setTime(""); setCapacity("10"); onFeedback("Aula criada na agenda.");
    } catch { onFeedback("Não foi possível criar a aula."); }
    finally { setSaving(false); }
  }

  async function toggleClass(item: ClassRecord) {
    if (!db) return;
    try { await updateDoc(doc(db, "academies", access.academyId, "classes", item.id), { active: !item.active }); onFeedback(item.active ? "Aula desativada." : "Aula reativada."); }
    catch { onFeedback("Não foi possível alterar a aula."); }
  }

  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro"><div><span>AGENDA · GESTÃO</span><h2>Aulas e reservas</h2><p>Configure turmas, horários e limite de vagas para os alunos.</p></div></section>
      <section className="classes-layout"><article className="workspace-panel plan-form-panel"><header><div><span>NOVA AULA</span><h3>Criar turma</h3></div></header><form className="student-detail-form" onSubmit={createClass}><label>Nome da aula<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Funcional" required /></label><label>Professor<input value={instructor} onChange={(event) => setInstructor(event.target.value)} placeholder="Ex.: Prof. Rafael" /></label><label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Horário<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label><label>Vagas<input type="number" min="1" max="200" value={capacity} onChange={(event) => setCapacity(event.target.value)} required /></label><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Criar aula"}</button></form></article><article className="workspace-panel plans-list-panel"><header><div><span>AGENDA DA ACADEMIA</span><h3>{classes.length} {classes.length === 1 ? "aula" : "aulas"}</h3></div></header><div className="plans-list">{classes.length === 0 ? <div className="directory-empty"><CalendarDays /><p>Nenhuma aula cadastrada ainda.</p></div> : classes.map((item) => <div className="plan-row" key={item.id}><div><strong>{item.name}</strong><small>{item.date} às {item.time} · {item.instructor} · {item.capacity} vagas</small></div><button className={item.active ? "plan-enable" : "plan-disable"} onClick={() => toggleClass(item)}>{item.active ? "Ativa" : "Inativa"}</button></div>)}</div></article></section>
    </div>
  );
}

const exercisePhaseOrder: ExercisePhase[] = ["Preparação", "Treino principal", "Cardio", "Finalização"];
const exerciseRegionOrder: BodyRegion[] = ["Membros superiores", "Tronco anterior", "Tronco posterior", "Região central", "Membros inferiores"];

function exercisePhaseIcon(phase: ExercisePhase) {
  if (phase === "Preparação") return <Activity />;
  if (phase === "Cardio") return <Gauge />;
  if (phase === "Finalização") return <Footprints />;
  return <Dumbbell />;
}

function exerciseRegionIcon(region: BodyRegion) {
  if (region === "Região central") return <Activity />;
  if (region === "Membros inferiores") return <Footprints />;
  return <PersonStanding />;
}

function ExercisePicker({ exercises, selectedExercises, exerciseDetails, onToggle, onParameterChange }: { exercises: ExerciseRecord[]; selectedExercises: string[]; exerciseDetails: Record<string, Omit<WorkoutExerciseDetail, "exerciseId" | "name">>; onToggle: (exercise: ExerciseRecord) => void; onParameterChange: (exerciseId: string, field: "sets" | "reps" | "load" | "rest", value: string) => void }) {
  const [openPhases, setOpenPhases] = useState<ExercisePhase[]>(["Preparação"]);
  function togglePhase(currentPhase: ExercisePhase) { setOpenPhases((current) => current.includes(currentPhase) ? current.filter((item) => item !== currentPhase) : [...current, currentPhase]); }
  return <div className="exercise-picker">{exercisePhaseOrder.map((currentPhase) => {
    const phaseExercises = exercises.filter((exercise) => (exercise.phase ?? "Treino principal") === currentPhase);
    if (!phaseExercises.length) return null;
    const isOpen = openPhases.includes(currentPhase);
    return <section className={isOpen ? "exercise-phase-group open" : "exercise-phase-group"} key={currentPhase}><button className="collapse-header" type="button" onClick={() => togglePhase(currentPhase)}><span><ChevronDown className={isOpen ? "rotated" : ""} />{exercisePhaseIcon(currentPhase)}{currentPhase}</span><small>{phaseExercises.length} exercícios · {currentPhase === "Preparação" ? "Alongamento e mobilidade antes da ficha" : "Selecione os exercícios desta etapa"}</small></button>{isOpen && <div className="collapse-content">{exerciseRegionOrder.map((region) => {
      const regionExercises = phaseExercises.filter((exercise) => (exercise.bodyRegion ?? "Membros superiores") === region);
      if (!regionExercises.length) return null;
      return <div className="exercise-region-group" key={region}><h4>{exerciseRegionIcon(region)}{region}</h4>{Array.from(new Set(regionExercises.map((exercise) => exercise.muscleGroup))).map((muscleGroup) => <div className="exercise-class-group" key={`${region}-${muscleGroup}`}><h5>{muscleGroup}</h5>{regionExercises.filter((exercise) => exercise.muscleGroup === muscleGroup).map((exercise) => { const selected = selectedExercises.includes(exercise.id); return <div className={selected ? "exercise-choice selected" : "exercise-choice"} key={exercise.id}><label><input type="checkbox" checked={selected} onChange={() => onToggle(exercise)} /><span><strong>{exercise.name}</strong><small>{exercise.exerciseType ?? "Força"}{exercise.secondaryMuscles ? ` · auxiliares: ${exercise.secondaryMuscles}` : ""}</small></span></label>{selected && <div className="exercise-parameters"><label>Séries<input value={exerciseDetails[exercise.id]?.sets ?? "3"} onChange={(event) => onParameterChange(exercise.id, "sets", event.target.value)} /></label><label>Repetições<input value={exerciseDetails[exercise.id]?.reps ?? "10"} onChange={(event) => onParameterChange(exercise.id, "reps", event.target.value)} /></label><label>Carga<input value={exerciseDetails[exercise.id]?.load ?? "0"} onChange={(event) => onParameterChange(exercise.id, "load", event.target.value)} /></label><label>Descanso<input value={exerciseDetails[exercise.id]?.rest ?? "60"} onChange={(event) => onParameterChange(exercise.id, "rest", event.target.value)} /></label></div>}</div>; })}</div>)}</div>;
    })}</div>}</section>;
  })}</div>;
}

function ExerciseLibrary({ exercises, accessRole, onEdit, onRemove }: { exercises: ExerciseRecord[]; accessRole: string; onEdit: (exercise: ExerciseRecord) => void; onRemove: (exercise: ExerciseRecord) => void }) {
  const [openRegions, setOpenRegions] = useState<BodyRegion[]>(["Membros superiores"]);
  function toggleRegion(region: BodyRegion) { setOpenRegions((current) => current.includes(region) ? current.filter((item) => item !== region) : [...current, region]); }
  return <div className="exercise-library">{exerciseRegionOrder.map((region) => { const regionExercises = exercises.filter((exercise) => (exercise.bodyRegion ?? "Membros superiores") === region); if (!regionExercises.length) return null; const isOpen = openRegions.includes(region); return <section className={isOpen ? "library-region-group open" : "library-region-group"} key={region}><button className="collapse-header" type="button" onClick={() => toggleRegion(region)}><span><ChevronDown className={isOpen ? "rotated" : ""} />{exerciseRegionIcon(region)}{region}</span><small>{regionExercises.length} exercícios</small></button>{isOpen && <div className="collapse-content">{Array.from(new Set(regionExercises.map((exercise) => exercise.muscleGroup))).map((muscleGroup) => <div className="library-class-group" key={`${region}-${muscleGroup}`}><h4>{muscleGroup}</h4>{regionExercises.filter((exercise) => exercise.muscleGroup === muscleGroup).map((exercise) => <div className="library-exercise-row" key={exercise.id}><div><strong>{exercise.name}</strong><small>{exercise.phase ?? "Treino principal"} · {exercise.exerciseType ?? "Força"}{exercise.secondaryMuscles ? ` · auxiliares: ${exercise.secondaryMuscles}` : ""}</small></div><div className="exercise-actions"><button type="button" onClick={() => onEdit(exercise)}>Editar</button>{accessRole === "admin" && <button type="button" onClick={() => onRemove(exercise)}>Excluir</button>}</div></div>)}</div>)}</div>}</section>; })}</div>;
}

function PublishedWorkouts({ templates, workouts, onEditTemplate, onRemoveTemplate, onEditWorkout, onRemoveWorkout }: { templates: WorkoutTemplateRecord[]; workouts: WorkoutRecord[]; onEditTemplate: (template: WorkoutTemplateRecord) => void; onRemoveTemplate: (template: WorkoutTemplateRecord) => void; onEditWorkout: (workout: WorkoutRecord) => void; onRemoveWorkout: (workout: WorkoutRecord) => void }) {
  const empty = templates.length === 0 && workouts.length === 0;
  return <section className="workspace-panel published-workouts"><header><div><span>MODELOS E TREINOS PUBLICADOS</span><h3>{templates.length} modelos · {workouts.length} publicados</h3></div></header>{empty ? <div className="directory-empty"><Dumbbell /><p>Salve uma ficha para reutilizar depois.</p></div> : <div className="published-list">{templates.map((template) => <div key={template.id}><div><strong>{template.name}</strong><small>Modelo reutilizável · {template.exerciseIds.length} exercícios</small></div><div className="published-item-actions"><em>Modelo</em><button type="button" onClick={() => onEditTemplate(template)}>Editar</button><button type="button" onClick={() => onRemoveTemplate(template)}>Excluir</button></div></div>)}{workouts.map((workout) => <div key={workout.id}><div><strong>{workout.name}</strong><small>{workout.studentName} · {workout.exerciseIds.length} exercícios</small></div><div className="published-item-actions"><em>Publicado</em><button type="button" onClick={() => onEditWorkout(workout)}>Editar</button><button type="button" onClick={() => onRemoveWorkout(workout)}>Excluir</button></div></div>)}</div>}</section>;
}

function TrainingModule({ onFeedback }: { onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [students, setStudents] = useState<BillingStudent[]>([]);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplateRecord[]>([]);
  const [exerciseName, setExerciseName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [secondaryMuscles, setSecondaryMuscles] = useState("");
  const [anatomyRegion, setAnatomyRegion] = useState("");
  const [instructions, setInstructions] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [bodyRegion, setBodyRegion] = useState<BodyRegion>("Membros superiores");
  const [phase, setPhase] = useState<ExercisePhase>("Treino principal");
  const [exerciseType, setExerciseType] = useState<ExerciseType>("Força");
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [workoutName, setWorkoutName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [exerciseDetails, setExerciseDetails] = useState<Record<string, Omit<WorkoutExerciseDetail, "exerciseId" | "name">>>({});
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    const academy = ["academies", access.academyId];
    const studentsRef = collection(db, "academies", access.academyId, "students");
    const studentsQuery = access.role === "teacher" ? query(studentsRef, where("teacherId", "==", access.userId)) : studentsRef;
    const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
      setStudents(snapshot.docs.map((student) => { const data = student.data() as { name?: string; active?: boolean; teacherId?: string | null }; return { id: student.id, name: data.name ?? "Aluno sem nome", active: data.active !== false, teacherId: data.teacherId ?? null }; }));
    });
    const unsubscribeExercises = onSnapshot(collection(db, "academies", access.academyId, "exercises"), (snapshot) => {
      setExercises(snapshot.docs.map((exercise) => { const data = exercise.data() as Omit<ExerciseRecord, "id">; const name = data.name ?? "Exercício"; const muscleGroup = data.muscleGroup ?? "Geral"; const fallback = starterClassification(name, muscleGroup); return { id: exercise.id, name, muscleGroup, secondaryMuscles: data.secondaryMuscles ?? "", anatomyRegion: data.anatomyRegion ?? "", instructions: data.instructions ?? "", videoUrl: data.videoUrl ?? "", bodyRegion: data.bodyRegion ?? fallback.bodyRegion, phase: data.phase ?? fallback.phase, exerciseType: data.exerciseType ?? fallback.exerciseType }; }));
    });
    const unsubscribeWorkouts = onSnapshot(collection(db, "academies", access.academyId, "workouts"), (snapshot) => {
      setWorkouts(snapshot.docs.map((workout) => { const data = workout.data() as Omit<WorkoutRecord, "id">; return { id: workout.id, ...data, exerciseIds: data.exerciseIds ?? [], exerciseDetails: data.exerciseDetails ?? [], status: data.status === "draft" ? "draft" : "published" }; }));
    });
    const unsubscribeTemplates = onSnapshot(collection(db, "academies", access.academyId, "workoutTemplates"), (snapshot) => {
      setTemplates(snapshot.docs.map((template) => { const data = template.data() as Omit<WorkoutTemplateRecord, "id">; return { id: template.id, ...data, exerciseIds: data.exerciseIds ?? [], exerciseDetails: data.exerciseDetails ?? [] }; }));
    });
    return () => { void academy; unsubscribeStudents(); unsubscribeExercises(); unsubscribeWorkouts(); unsubscribeTemplates(); };
  }, [access.academyId, access.role, access.userId]);

  async function createExerciseLegacy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !exerciseName.trim() || !muscleGroup.trim()) return;
    try {
      await addDoc(collection(db, "academies", access.academyId, "exercises"), { name: exerciseName.trim(), muscleGroup: muscleGroup.trim(), bodyRegion: "Membros superiores", phase: "Treino principal", exerciseType: "Força", createdBy: access.userId, createdAt: serverTimestamp() });
      setExerciseName(""); setMuscleGroup(""); setSecondaryMuscles(""); setAnatomyRegion(""); setInstructions(""); setVideoUrl(""); onFeedback("Exercício cadastrado.");
    } catch { onFeedback("Não foi possível cadastrar o exercício."); }
  }

  function editExercise(exercise: ExerciseRecord) {
    setEditingExerciseId(exercise.id); setExerciseName(exercise.name); setMuscleGroup(exercise.muscleGroup); setSecondaryMuscles(exercise.secondaryMuscles ?? ""); setAnatomyRegion(exercise.anatomyRegion ?? ""); setInstructions(exercise.instructions ?? ""); setVideoUrl(exercise.videoUrl ?? ""); setBodyRegion(exercise.bodyRegion ?? "Membros superiores"); setPhase(exercise.phase ?? "Treino principal"); setExerciseType(exercise.exerciseType ?? "Força");
  }

  function clearExerciseForm() {
    setEditingExerciseId(null); setExerciseName(""); setMuscleGroup(""); setSecondaryMuscles(""); setAnatomyRegion(""); setInstructions(""); setVideoUrl(""); setBodyRegion("Membros superiores"); setPhase("Treino principal"); setExerciseType("Força");
  }

  async function createExercise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !exerciseName.trim() || !muscleGroup.trim()) return;
    const data = { name: exerciseName.trim(), muscleGroup: muscleGroup.trim(), secondaryMuscles: secondaryMuscles.trim(), anatomyRegion: anatomyRegion.trim(), instructions: instructions.trim(), videoUrl: videoUrl.trim(), bodyRegion, phase, exerciseType, updatedBy: access.userId, updatedAt: serverTimestamp() };
    try {
      if (editingExerciseId) {
        await updateDoc(doc(db, "academies", access.academyId, "exercises", editingExerciseId), data);
        onFeedback("Exercício atualizado.");
      } else {
        await addDoc(collection(db, "academies", access.academyId, "exercises"), { ...data, createdBy: access.userId, createdAt: serverTimestamp() });
        onFeedback("Exercício cadastrado.");
      }
      clearExerciseForm();
    } catch { onFeedback("Não foi possível salvar o exercício."); }
  }

  async function removeExercise(exercise: ExerciseRecord) {
    if (!db || access.role !== "admin" || !window.confirm(`Excluir o exercício \"${exercise.name}\"? Treinos já publicados não serão alterados.`)) return;
    try {
      await deleteDoc(doc(db, "academies", access.academyId, "exercises", exercise.id));
      if (editingExerciseId === exercise.id) clearExerciseForm();
      onFeedback("Exercício excluído da biblioteca.");
    } catch { onFeedback("Não foi possível excluir o exercício."); }
  }

  async function seedStarterExercises() {
    if (!db) return;
    const firestore = db;
    const existingNames = new Set(exercises.map((exercise) => exercise.name.trim().toLocaleLowerCase("pt-BR")));
    const pending = starterExercises.filter(([name]) => !existingNames.has(name.toLocaleLowerCase("pt-BR")));
    if (pending.length === 0) {
      onFeedback("A biblioteca inicial já foi carregada.");
      return;
    }
    const batch = writeBatch(firestore);
    pending.forEach(([name, primary, secondary, region]) => {
      const exerciseRef = doc(collection(firestore, "academies", access.academyId, "exercises"));
      const classification = starterClassification(name, primary);
      batch.set(exerciseRef, { name, muscleGroup: primary, secondaryMuscles: secondary, anatomyRegion: region, instructions: "Orientação objetiva será adicionada pelo professor.", videoUrl: "", ...classification, createdBy: access.userId, createdAt: serverTimestamp(), source: "starter-library" });
    });
    try {
      await batch.commit();
      onFeedback(`${pending.length} exercícios adicionados à biblioteca.`);
    } catch {
      onFeedback("Não foi possível carregar a biblioteca inicial.");
    }
  }

  function toggleExercise(exercise: ExerciseRecord) {
    const selected = selectedExercises.includes(exercise.id);
    setSelectedExercises((current) => selected ? current.filter((id) => id !== exercise.id) : [...current, exercise.id]);
    if (!selected) setExerciseDetails((current) => ({ ...current, [exercise.id]: { sets: "3", reps: "10", load: "0", rest: "60" } }));
  }

  function updateExerciseParameter(exerciseId: string, field: "sets" | "reps" | "load" | "rest", value: string) {
    setExerciseDetails((current) => ({ ...current, [exerciseId]: { sets: current[exerciseId]?.sets ?? "3", reps: current[exerciseId]?.reps ?? "10", load: current[exerciseId]?.load ?? "0", rest: current[exerciseId]?.rest ?? "60", [field]: value } }));
  }

  async function createWorkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !workoutName.trim() || !studentId || selectedExercises.length === 0) return;
    const preparationCount = selectedExercises.filter((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId)?.phase === "Preparação").length;
    if (preparationCount < 1 || preparationCount > 3) { onFeedback("Inclua de 1 a 3 exercícios de preparação antes de publicar o treino."); return; }
    const student = students.find((item) => item.id === studentId);
    if (!student) return;
    setSaving(true);
    try {
      const details = selectedExercises.map((exerciseId) => {
        const exercise = exercises.find((item) => item.id === exerciseId);
        return { exerciseId, name: exercise?.name ?? "Exercício", muscleGroup: exercise?.muscleGroup, secondaryMuscles: exercise?.secondaryMuscles, anatomyRegion: exercise?.anatomyRegion, instructions: exercise?.instructions, videoUrl: exercise?.videoUrl, bodyRegion: exercise?.bodyRegion, phase: exercise?.phase, exerciseType: exercise?.exerciseType, ...exerciseDetails[exerciseId] };
      });
      const workoutData = { name: workoutName.trim(), studentId, studentName: student.name, exerciseIds: selectedExercises, exerciseDetails: details, status: "published" as const, updatedBy: access.userId, updatedAt: serverTimestamp() };
      if (editingWorkoutId) {
        await updateDoc(doc(db, "academies", access.academyId, "workouts", editingWorkoutId), workoutData);
        onFeedback("Treino atualizado para o aluno.");
      } else {
        await addDoc(collection(db, "academies", access.academyId, "workouts"), { ...workoutData, createdBy: access.userId, createdAt: serverTimestamp(), publishedAt: serverTimestamp() });
        onFeedback("Treino publicado para o aluno.");
      }
      setWorkoutName(""); setStudentId(""); setSelectedExercises([]); setExerciseDetails({}); setEditingWorkoutId(null);
    } catch { onFeedback("Não foi possível publicar o treino."); }
    finally { setSaving(false); }
  }

  async function saveTemplate() {
    if (!db || !workoutName.trim() || selectedExercises.length === 0) return;
    const preparationCount = selectedExercises.filter((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId)?.phase === "Preparação").length;
    if (preparationCount < 1 || preparationCount > 3) { onFeedback("Inclua de 1 a 3 exercícios de preparação no modelo."); return; }
    const details = selectedExercises.map((exerciseId) => {
      const exercise = exercises.find((item) => item.id === exerciseId);
      return { exerciseId, name: exercise?.name ?? "Exercício", muscleGroup: exercise?.muscleGroup, secondaryMuscles: exercise?.secondaryMuscles, anatomyRegion: exercise?.anatomyRegion, instructions: exercise?.instructions, videoUrl: exercise?.videoUrl, bodyRegion: exercise?.bodyRegion, phase: exercise?.phase, exerciseType: exercise?.exerciseType, ...exerciseDetails[exerciseId] };
    });
    try {
      const templateData = { name: workoutName.trim(), exerciseIds: selectedExercises, exerciseDetails: details, updatedBy: access.userId, updatedAt: serverTimestamp() };
      if (editingTemplateId) {
        await updateDoc(doc(db, "academies", access.academyId, "workoutTemplates", editingTemplateId), templateData);
        onFeedback("Modelo de treino atualizado.");
      } else {
        await addDoc(collection(db, "academies", access.academyId, "workoutTemplates"), { ...templateData, createdBy: access.userId, createdAt: serverTimestamp() });
        onFeedback("Modelo de treino salvo na biblioteca.");
      }
      setEditingTemplateId(null);
    } catch { onFeedback("Não foi possível salvar o modelo."); }
  }

  function loadTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingTemplateId(null); setEditingWorkoutId(null);
    setWorkoutName(template.name);
    setSelectedExercises(template.exerciseIds);
    setExerciseDetails(Object.fromEntries(template.exerciseDetails.map((detail) => [detail.exerciseId, { sets: detail.sets, reps: detail.reps, load: detail.load, rest: detail.rest }])));
    onFeedback("Modelo carregado. Adapte os dados antes de publicar.");
  }

  function beginTemplateEdit(template: WorkoutTemplateRecord) {
    setEditingTemplateId(template.id); setEditingWorkoutId(null); setWorkoutName(template.name); setStudentId(""); setSelectedExercises(template.exerciseIds);
    setExerciseDetails(Object.fromEntries(template.exerciseDetails.map((detail) => [detail.exerciseId, { sets: detail.sets, reps: detail.reps, load: detail.load, rest: detail.rest }])));
    window.scrollTo({ top: 0, behavior: "smooth" }); onFeedback("Modelo carregado para edição.");
  }

  function beginWorkoutEdit(workout: WorkoutRecord) {
    setEditingWorkoutId(workout.id); setEditingTemplateId(null); setWorkoutName(workout.name); setStudentId(workout.studentId); setSelectedExercises(workout.exerciseIds);
    setExerciseDetails(Object.fromEntries((workout.exerciseDetails ?? []).map((detail) => [detail.exerciseId, { sets: detail.sets, reps: detail.reps, load: detail.load, rest: detail.rest }])));
    window.scrollTo({ top: 0, behavior: "smooth" }); onFeedback("Treino carregado para edição.");
  }

  async function removeTemplate(template: WorkoutTemplateRecord) {
    if (!db || !window.confirm(`Excluir o modelo "${template.name}"?`)) return;
    try { await deleteDoc(doc(db, "academies", access.academyId, "workoutTemplates", template.id)); if (editingTemplateId === template.id) setEditingTemplateId(null); onFeedback("Modelo excluído."); }
    catch { onFeedback("Não foi possível excluir o modelo."); }
  }

  async function removeWorkout(workout: WorkoutRecord) {
    if (!db || !window.confirm(`Excluir o treino "${workout.name}" de ${workout.studentName}?`)) return;
    try { await deleteDoc(doc(db, "academies", access.academyId, "workouts", workout.id)); if (editingWorkoutId === workout.id) setEditingWorkoutId(null); onFeedback("Treino excluído."); }
    catch { onFeedback("Não foi possível excluir o treino."); }
  }

  return <div className="workspace-content module-view">
    <section className="workspace-intro"><div><span>PRESCRIÇÃO · {access.role === "teacher" ? "PROFESSOR" : "GESTÃO"}</span><h2>Treinos</h2><p>Monte uma ficha por etapas, salve modelos e publique para um aluno quando estiver pronta.</p></div></section>
    <section className="training-layout training-layout-redesigned">
      <article className="workspace-panel training-form-panel"><header><div><span>1 · MONTAGEM DA FICHA</span><h3>Escolher exercícios</h3><p className="panel-helper">Comece pela preparação, avance para o treino principal e finalize com cardio ou alongamento.</p></div></header><form className="student-detail-form" onSubmit={createWorkout}><label>Modelo existente<select defaultValue="" onChange={(event) => loadTemplate(event.target.value)}><option value="">Criar ficha do zero</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Nome da ficha<input value={workoutName} onChange={(event) => setWorkoutName(event.target.value)} placeholder="Ex.: Peito e bíceps · A" required /></label><label>Aluno específico <span className="optional-label">opcional para salvar como modelo</span><select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Nenhum aluno · salvar modelo</option>{students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><ExercisePicker exercises={exercises} selectedExercises={selectedExercises} exerciseDetails={exerciseDetails} onToggle={toggleExercise} onParameterChange={updateExerciseParameter} /><div className="training-actions"><button className="detail-secondary" type="button" onClick={saveTemplate} disabled={!workoutName.trim() || selectedExercises.length === 0}>Salvar modelo</button><button className="detail-save" type="submit" disabled={saving || !studentId || selectedExercises.length === 0}>{saving ? "Publicando..." : "Publicar para aluno"}</button></div></form><ExerciseLibrary exercises={exercises} accessRole={access.role} onEdit={editExercise} onRemove={(exercise) => void removeExercise(exercise)} /></article>
      <article className="workspace-panel training-form-panel"><header><div><span>BIBLIOTECA DE EXERCÍCIOS</span><h3>Organizada por corpo e classe</h3><p className="panel-helper">Cadastre ou edite a base usada nas fichas.</p></div></header><div className="starter-library-box"><p>Inclui musculação, peso corporal, alongamento, mobilidade e cardio.</p><button className="detail-secondary" type="button" onClick={seedStarterExercises}>Carregar biblioteca inicial</button></div><form className="student-detail-form" onSubmit={createExercise}><label>Nome do exercício<input value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="Ex.: Agachamento livre" required /></label><label>Grupo muscular / classe<input value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)} placeholder="Ex.: Peito" required /></label><label>Região corporal<select value={bodyRegion} onChange={(event) => setBodyRegion(event.target.value as BodyRegion)}><option>Membros superiores</option><option>Tronco anterior</option><option>Tronco posterior</option><option>Região central</option><option>Membros inferiores</option></select></label><label>Fase do treino<select value={phase} onChange={(event) => setPhase(event.target.value as ExercisePhase)}><option>Preparação</option><option>Treino principal</option><option>Cardio</option><option>Finalização</option></select></label><label>Tipo de exercício<select value={exerciseType} onChange={(event) => setExerciseType(event.target.value as ExerciseType)}><option>Força</option><option>Peso corporal</option><option>Alongamento</option><option>Cardio</option></select></label><label>Músculos auxiliares<input value={secondaryMuscles} onChange={(event) => setSecondaryMuscles(event.target.value)} placeholder="Ex.: Tríceps, ombros" /></label><label>Região no corpo anatômico<input value={anatomyRegion} onChange={(event) => setAnatomyRegion(event.target.value)} placeholder="Ex.: Peitoral" /></label><label>Como executar<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Explicação objetiva da execução" /></label><label>Vídeo próprio<input type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="Link após gravar" /></label><div className="exercise-form-actions"><button className="detail-save" type="submit">{editingExerciseId ? "Salvar alterações" : "Cadastrar exercício"}</button>{editingExerciseId && <button className="detail-secondary" type="button" onClick={clearExerciseForm}>Cancelar edição</button>}</div></form></article>
    </section>
    <PublishedWorkouts templates={templates} workouts={workouts} onEditTemplate={beginTemplateEdit} onRemoveTemplate={(template) => void removeTemplate(template)} onEditWorkout={beginWorkoutEdit} onRemoveWorkout={(workout) => void removeWorkout(workout)} />
  </div>;

  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro"><div><span>PRESCRIÇÃO · {access.role === "teacher" ? "PROFESSOR" : "GESTÃO"}</span><h2>Treinos</h2><p>Cadastre exercícios e publique fichas vinculadas aos alunos.</p></div></section>
      <section className="training-layout">
        <article className="workspace-panel training-form-panel"><header><div><span>FICHA DE TREINO</span><h3>Montar e publicar</h3></div></header><form className="student-detail-form" onSubmit={createWorkout}><label>Usar modelo pronto<select defaultValue="" onChange={(event) => loadTemplate(event.target.value)}><option value="">Começar do zero</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Nome do treino<input value={workoutName} onChange={(event) => setWorkoutName(event.target.value)} placeholder="Ex.: Força A" required /></label><label>Aluno<select value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="">Selecione um aluno</option>{students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><fieldset className="exercise-picker"><legend>Exercícios da ficha</legend>{exercises.length === 0 ? <small>Nenhum exercício cadastrado.</small> : exercises.map((exercise) => <div className="exercise-choice" key={exercise.id}><label><input type="checkbox" checked={selectedExercises.includes(exercise.id)} onChange={() => { const selected = selectedExercises.includes(exercise.id); setSelectedExercises((current) => selected ? current.filter((id) => id !== exercise.id) : [...current, exercise.id]); if (!selected) setExerciseDetails((current) => ({ ...current, [exercise.id]: { sets: "3", reps: "10", load: "0", rest: "60" } })); }} /><span>{exercise.name}<small>{exercise.muscleGroup}</small></span></label>{selectedExercises.includes(exercise.id) && <div className="exercise-parameters"><label>Séries<input value={exerciseDetails[exercise.id]?.sets ?? "3"} onChange={(event) => setExerciseDetails((current) => ({ ...current, [exercise.id]: { ...current[exercise.id], sets: event.target.value } }))} /></label><label>Reps<input value={exerciseDetails[exercise.id]?.reps ?? "10"} onChange={(event) => setExerciseDetails((current) => ({ ...current, [exercise.id]: { ...current[exercise.id], reps: event.target.value } }))} /></label><label>Carga<input value={exerciseDetails[exercise.id]?.load ?? "0"} onChange={(event) => setExerciseDetails((current) => ({ ...current, [exercise.id]: { ...current[exercise.id], load: event.target.value } }))} /></label><label>Descanso<input value={exerciseDetails[exercise.id]?.rest ?? "60"} onChange={(event) => setExerciseDetails((current) => ({ ...current, [exercise.id]: { ...current[exercise.id], rest: event.target.value } }))} /></label></div>}</div>)}</fieldset><div className="training-actions"><button className="detail-secondary" type="button" onClick={saveTemplate} disabled={!workoutName.trim() || selectedExercises.length === 0}>Salvar como modelo</button><button className="detail-save" type="submit" disabled={saving}>{saving ? "Publicando..." : "Publicar treino"}</button></div></form></article>
        <article className="workspace-panel training-form-panel"><header><div><span>BIBLIOTECA</span><h3>Novo exercício</h3></div></header><div className="starter-library-box"><p>Comece com uma base pronta e personalize os exercícios depois.</p><button className="detail-secondary" type="button" onClick={seedStarterExercises}>Carregar biblioteca inicial</button></div><form className="student-detail-form" onSubmit={createExercise}><label>Nome do exercício<input value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="Ex.: Agachamento livre" required /></label><label>Grupo muscular principal<input value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)} placeholder="Ex.: Peito" required /></label><label>Região corporal<select value={bodyRegion} onChange={(event) => setBodyRegion(event.target.value as BodyRegion)}><option>Membros superiores</option><option>Tronco anterior</option><option>Tronco posterior</option><option>Região central</option><option>Membros inferiores</option></select></label><label>Fase do treino<select value={phase} onChange={(event) => setPhase(event.target.value as ExercisePhase)}><option>Preparação</option><option>Treino principal</option><option>Cardio</option><option>Finalização</option></select></label><label>Tipo de exercício<select value={exerciseType} onChange={(event) => setExerciseType(event.target.value as ExerciseType)}><option>Força</option><option>Peso corporal</option><option>Alongamento</option><option>Cardio</option></select></label><label>Músculos auxiliares<input value={secondaryMuscles} onChange={(event) => setSecondaryMuscles(event.target.value)} placeholder="Ex.: Tríceps, ombros" /></label><label>Região no corpo anatômico<input value={anatomyRegion} onChange={(event) => setAnatomyRegion(event.target.value)} placeholder="Ex.: Peitoral" /></label><label>Como executar<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Explicação objetiva da execução" /></label><label>Vídeo próprio (link futuro)<input type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="Será preenchido após gravar" /></label><div className="exercise-form-actions"><button className="detail-save" type="submit">{editingExerciseId ? "Salvar alterações" : "Cadastrar exercício"}</button>{editingExerciseId && <button className="detail-secondary" type="button" onClick={clearExerciseForm}>Cancelar edição</button>}</div></form><div className="exercise-library">{exercises.map((exercise) => <div key={exercise.id}><div><strong>{exercise.name}</strong><small>{exercise.bodyRegion ?? "Não classificado"} · {exercise.phase ?? "Treino principal"} · {exercise.muscleGroup}</small></div><div className="exercise-actions"><button type="button" onClick={() => editExercise(exercise)}>Editar</button>{access.role === "admin" && <button type="button" onClick={() => void removeExercise(exercise)}>Excluir</button>}</div></div>)}</div></article>
      </section>
      <section className="workspace-panel published-workouts"><header><div><span>BIBLIOTECA E PUBLICADOS</span><h3>{templates.length} modelos · {workouts.length} publicados</h3></div></header>{templates.length === 0 && workouts.length === 0 ? <div className="directory-empty"><Dumbbell /><p>Salve uma ficha como modelo para reutilizá-la.</p></div> : <div className="published-list">{templates.map((template) => <div key={template.id}><div><strong>{template.name}</strong><small>Modelo reutilizável · {template.exerciseIds.length} exercícios</small></div><em>Modelo</em></div>)}{workouts.map((workout) => <div key={workout.id}><div><strong>{workout.name}</strong><small>{workout.studentName} · {workout.exerciseIds.length} exercícios</small></div><em>Publicado</em></div>)}</div>}</section>
    </div>
  );
}

function BillingModule({ onFeedback }: { onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [students, setStudents] = useState<BillingStudent[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [charges, setCharges] = useState<MonthlyCharge[]>([]);
  const [studentId, setStudentId] = useState("");
  const [planId, setPlanId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [chargeType, setChargeType] = useState<ChargeType>("monthly");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [planName, setPlanName] = useState("");
  const [planPrice, setPlanPrice] = useState("");
  const [planInterval, setPlanInterval] = useState("Mensal");
  const [filter, setFilter] = useState<"all" | ChargeViewStatus>("all");
  const [saving, setSaving] = useState(false);
  const [paymentCharge, setPaymentCharge] = useState<MonthlyCharge | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    if (!db) return;
    const unsubscribeStudents = onSnapshot(collection(db, "academies", access.academyId, "students"), (snapshot) => {
      setStudents(snapshot.docs.map((student) => {
        const data = student.data() as { name?: string; active?: boolean };
        return { id: student.id, name: data.name ?? "Aluno sem nome", active: data.active !== false };
      }));
    });
    const unsubscribePlans = onSnapshot(collection(db, "academies", access.academyId, "plans"), (snapshot) => {
      setPlans(snapshot.docs.map((plan) => {
        const data = plan.data() as { name?: string; price?: number; active?: boolean };
        return { id: plan.id, name: data.name ?? "Plano sem nome", price: Number(data.price ?? 0), active: data.active !== false };
      }));
    });
    const unsubscribeCharges = onSnapshot(collection(db, "academies", access.academyId, "monthlyCharges"), (snapshot) => {
      setCharges(snapshot.docs.map((charge) => {
        const data = charge.data() as Omit<MonthlyCharge, "id">;
        const status: MonthlyCharge["status"] = data.status === "paid" ? "paid" : "pending";
        return { id: charge.id, ...data, amount: Number(data.amount ?? 0), status };
      }).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    });
    return () => { unsubscribeStudents(); unsubscribePlans(); unsubscribeCharges(); };
  }, [access.academyId]);

  async function createCharge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !studentId || !dueDate) return;
    const student = students.find((item) => item.id === studentId);
    const plan = plans.find((item) => item.id === planId);
    const amount = chargeType === "monthly" ? plan?.price ?? 0 : Number(chargeAmount.replace(",", "."));
    if (!student || (chargeType === "monthly" && !plan) || !amount) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "academies", access.academyId, "monthlyCharges"), { studentId, studentName: student.name, planId: plan?.id ?? null, planName: chargeType === "monthly" ? plan?.name : chargeDescription.trim() || (chargeType === "registration" ? "Taxa de inscrição" : "Serviço avulso"), chargeType, amount, dueDate, status: "pending", createdBy: access.userId, createdAt: serverTimestamp() });
      setStudentId(""); setPlanId(""); setDueDate(""); setChargeDescription(""); setChargeAmount("");
      onFeedback("Mensalidade criada.");
    } catch { onFeedback("Não foi possível criar a mensalidade."); }
    finally { setSaving(false); }
  }

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !planName.trim() || !planPrice) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "academies", access.academyId, "plans"), { name: planName.trim(), price: Number(planPrice.replace(",", ".")), interval: planInterval, active: true, createdBy: access.userId, createdAt: serverTimestamp() });
      setPlanName(""); setPlanPrice(""); setPlanInterval("Mensal");
      onFeedback("Plano cadastrado com sucesso.");
    } catch { onFeedback("Não foi possível cadastrar o plano."); }
    finally { setSaving(false); }
  }

  async function confirmPayment() {
    if (!db || !paymentCharge) return;
    setSavingPayment(true);
    try {
      await updateDoc(doc(db, "academies", access.academyId, "monthlyCharges", paymentCharge.id), { status: "paid", paymentMethod, paidAt: serverTimestamp(), paidBy: access.userId });
      setPaymentCharge(null);
      onFeedback("Pagamento registrado e mensalidade baixada.");
    } catch { onFeedback("Não foi possível registrar o pagamento."); }
    finally { setSavingPayment(false); }
  }

  async function toggleCharge(charge: MonthlyCharge) {
    if (!db) return;
    try {
      await updateDoc(doc(db, "academies", access.academyId, "monthlyCharges", charge.id), { status: "pending" });
      onFeedback(charge.status === "paid" ? "Mensalidade voltou para pendente." : "Mensalidade marcada como paga.");
    } catch { onFeedback("Não foi possível atualizar a mensalidade."); }
  }

  const chargeRows = charges.map((charge) => ({ ...charge, viewStatus: chargeViewStatus(charge) }));
  const totals = chargeRows.reduce((summary, charge) => {
    summary.total += charge.amount;
    if (charge.viewStatus === "paid") summary.received += charge.amount;
    if (charge.viewStatus === "overdue") summary.overdue += charge.amount;
    if (charge.viewStatus === "pending" || charge.viewStatus === "dueSoon") summary.open += charge.amount;
    return summary;
  }, { total: 0, received: 0, overdue: 0, open: 0 });
  const visibleCharges = chargeRows.filter((charge) => filter === "all" || charge.viewStatus === filter);
  const upcomingCount = chargeRows.filter((charge) => charge.viewStatus === "dueSoon").length;

  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro"><div><span>RECEITA · GESTÃO</span><h2>Planos e mensalidades</h2><p>Gere cobranças vinculadas aos alunos e acompanhe os recebimentos.</p></div></section>
      <section className="billing-layout">
        <div className="billing-form-stack"><article className="workspace-panel plan-form-panel"><header><div><span>NOVO PLANO</span><h3>Cadastrar plano</h3></div></header><form className="student-detail-form" onSubmit={createPlan}><label>Nome do plano<input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="Ex.: Plano mensal" required /></label><label>Valor<input value={planPrice} onChange={(event) => setPlanPrice(event.target.value)} inputMode="decimal" placeholder="R$ 0,00" required /></label><label>Periodicidade<select value={planInterval} onChange={(event) => setPlanInterval(event.target.value)}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></label><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Cadastrar plano"}</button></form></article><article className="workspace-panel plan-form-panel"><header><div><span>NOVA COBRANÇA</span><h3>Gerar cobrança</h3></div></header><form className="student-detail-form" onSubmit={createCharge}><label>Tipo<select value={chargeType} onChange={(event) => setChargeType(event.target.value as ChargeType)}><option value="monthly">Mensalidade</option><option value="registration">Taxa de inscrição</option><option value="service">Serviço avulso</option></select></label><label>Aluno<select value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="">Selecione um aluno</option>{students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>{chargeType === "monthly" ? <label>Plano<select value={planId} onChange={(event) => setPlanId(event.target.value)} required><option value="">Selecione um plano</option>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · R$ {plan.price.toFixed(2).replace(".", ",")}</option>)}</select></label> : <><label>Descrição<input value={chargeDescription} onChange={(event) => setChargeDescription(event.target.value)} placeholder={chargeType === "registration" ? "Taxa de inscrição" : "Ex.: Avaliação física"} /></label><label>Valor<input value={chargeAmount} onChange={(event) => setChargeAmount(event.target.value)} inputMode="decimal" placeholder="R$ 0,00" required /></label></>}<label>Vencimento<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label><button className="detail-save" type="submit" disabled={saving || students.length === 0 || (chargeType === "monthly" && plans.length === 0)}>{saving ? "Gerando..." : "Gerar cobrança"}</button></form></article></div>
        <article className="workspace-panel billing-overview"><header><div><span>LEITURA DO MÊS</span><h3>Resumo financeiro</h3></div><small>{upcomingCount ? `${upcomingCount} vencendo em até 7 dias` : "Nenhum vencimento próximo"}</small></header><div className="billing-summary-grid"><div><small>Previsto</small><strong>R$ {totals.total.toFixed(2).replace(".", ",")}</strong></div><div className="received"><small>Recebido</small><strong>R$ {totals.received.toFixed(2).replace(".", ",")}</strong></div><div className="overdue"><small>Vencido</small><strong>R$ {totals.overdue.toFixed(2).replace(".", ",")}</strong></div></div><div className="billing-progress"><span style={{ width: `${totals.total ? Math.min(100, (totals.received / totals.total) * 100) : 0}%` }} /></div><div className="billing-progress-label"><span>{totals.total ? Math.round((totals.received / totals.total) * 100) : 0}% recebido</span><span>Em aberto: R$ {totals.open.toFixed(2).replace(".", ",")}</span></div></article>
      </section>
      <section className="workspace-panel charges-panel"><header><div><span>ACOMPANHAMENTO</span><h3>{charges.length} {charges.length === 1 ? "mensalidade" : "mensalidades"}</h3></div><div className="charge-filters" role="tablist" aria-label="Filtrar mensalidades">{([["all", "Todas"], ["dueSoon", "Próximas"], ["overdue", "Vencidas"], ["paid", "Pagas"]] as const).map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></header><div className="charges-list">{visibleCharges.length === 0 ? <div className="directory-empty"><WalletCards /><p>{charges.length === 0 ? "Nenhuma mensalidade gerada ainda." : "Nenhuma mensalidade neste filtro."}</p></div> : visibleCharges.map((charge) => <div className="charge-row" key={charge.id}><div className="charge-main"><strong>{charge.studentName}</strong><small>{charge.planName} · Vencimento {formatDate(charge.dueDate)}{charge.paymentMethod ? ` · ${charge.paymentMethod}` : ""}</small></div><b>R$ {charge.amount.toFixed(2).replace(".", ",")}</b><span className={`charge-status ${charge.viewStatus}`}>{chargeStatusLabel(charge.viewStatus)}</span><button className="charge-action" onClick={() => charge.status === "paid" ? toggleCharge(charge) : setPaymentCharge(charge)}>{charge.status === "paid" ? "Desfazer baixa" : "Dar baixa"}</button></div>)}</div></section>
      {paymentCharge && <div className="permissions-backdrop" role="dialog" aria-modal="true" aria-labelledby="payment-title"><section className="payment-modal"><header><div><span>BAIXA MANUAL</span><h2 id="payment-title">Registrar pagamento</h2><p>{paymentCharge.studentName} · R$ {paymentCharge.amount.toFixed(2).replace(".", ",")}</p></div><button aria-label="Fechar registro de pagamento" onClick={() => setPaymentCharge(null)}><X /></button></header><div className="payment-method-grid">{([['pix', 'Pix'], ['maquininha', 'Maquininha'], ['dinheiro', 'Dinheiro'], ['transferencia', 'Transferência'], ['boleto', 'Boleto']] as const).map(([value, label]) => <button key={value} className={paymentMethod === value ? "active" : ""} onClick={() => setPaymentMethod(value)}>{label}</button>)}</div><div className="payment-modal-actions"><button className="modal-secondary" onClick={() => setPaymentCharge(null)}>Cancelar</button><button className="detail-save" onClick={confirmPayment} disabled={savingPayment}>{savingPayment ? "Salvando..." : "Confirmar pagamento"}</button></div></section></div>}
    </div>
  );
}

function PlansModule({ onFeedback }: { onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [plans, setPlans] = useState<AcademyPlan[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState("Mensal");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, "academies", access.academyId, "plans"), (snapshot) => {
      setPlans(snapshot.docs.map((plan) => {
        const data = plan.data() as { name?: string; price?: number; interval?: string; active?: boolean };
        return { id: plan.id, name: data.name ?? "Plano sem nome", price: Number(data.price ?? 0), interval: data.interval ?? "Mensal", active: data.active !== false };
      }));
    }, (error) => console.error("Não foi possível carregar os planos.", error));
  }, [access.academyId]);

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !name.trim() || !price) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "academies", access.academyId, "plans"), {
        name: name.trim(),
        price: Number(price.replace(",", ".")),
        interval,
        active: true,
        createdBy: access.userId,
        createdAt: serverTimestamp(),
      });
      setName("");
      setPrice("");
      setInterval("Mensal");
      onFeedback("Plano criado com sucesso.");
    } catch {
      onFeedback("Não foi possível criar o plano.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePlan(plan: AcademyPlan) {
    if (!db) return;
    try {
      await updateDoc(doc(db, "academies", access.academyId, "plans", plan.id), { active: !plan.active });
      onFeedback(plan.active ? "Plano desativado." : "Plano reativado.");
    } catch {
      onFeedback("Não foi possível alterar o plano.");
    }
  }

  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro"><div><span>RECEITA · GESTÃO</span><h2>Planos e mensalidades</h2><p>Cadastre os planos que serão usados nas mensalidades dos alunos.</p></div></section>
      <section className="plans-layout">
        <article className="workspace-panel plan-form-panel"><header><div><span>NOVO PLANO</span><h3>Criar plano</h3></div></header><form className="student-detail-form" onSubmit={createPlan}><label>Nome do plano<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Plano mensal" required /></label><label>Valor mensal<input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="R$ 0,00" required /></label><label>Periodicidade<select value={interval} onChange={(event) => setInterval(event.target.value)}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></label><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Criar plano"}</button></form></article>
        <article className="workspace-panel plans-list-panel"><header><div><span>PLANOS CADASTRADOS</span><h3>{plans.length} {plans.length === 1 ? "plano" : "planos"}</h3></div></header><div className="plans-list">{plans.length === 0 ? <div className="directory-empty"><WalletCards /><p>Nenhum plano cadastrado ainda.</p></div> : plans.map((plan) => <div className="plan-row" key={plan.id}><div><strong>{plan.name}</strong><small>{plan.interval} · {plan.active ? "Disponível" : "Desativado"}</small></div><b>R$ {plan.price.toFixed(2).replace(".", ",")}</b><button className={plan.active ? "plan-disable" : "plan-enable"} onClick={() => togglePlan(plan)}>{plan.active ? "Desativar" : "Ativar"}</button></div>)}</div></article>
      </section>
      <div className="module-empty plans-next-step"><WalletCards /><h3>Mensalidades</h3><p>Depois dos planos, vamos gerar cobranças, vencimentos e status de pagamento por aluno.</p></div>
    </div>
  );
}

function TeachersModule({ onFeedback }: { onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [teachers, setTeachers] = useState<RegisteredTeacher[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, "academies", access.academyId, "teachers"), (snapshot) => {
      setTeachers(snapshot.docs.map((teacher) => {
        const data = teacher.data() as { name?: string; email?: string | null; active?: boolean };
        return { id: teacher.id, name: data.name ?? "Professor sem nome", email: data.email ?? null, active: data.active !== false };
      }));
    }, (error) => console.error("Não foi possível carregar os professores.", error));
  }, [access.academyId]);

  const filteredTeachers = teachers.filter((teacher) => `${teacher.name} ${teacher.email ?? ""}`.toLowerCase().includes(search.toLowerCase().trim()));
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedTeacher) return;
    setEditName(selectedTeacher.name);
    setEditEmail(selectedTeacher.email ?? "");
  }, [selectedTeacher]);

  async function saveTeacher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !selectedTeacher || !editName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "academies", access.academyId, "teachers", selectedTeacher.id), { name: editName.trim(), email: editEmail.trim() || null });
      onFeedback("Dados do professor atualizados.");
    } catch {
      onFeedback("Não foi possível atualizar este professor.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTeacher() {
    if (!db || !selectedTeacher) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "academies", access.academyId, "teachers", selectedTeacher.id), { active: selectedTeacher.active === false });
      batch.update(doc(db, "academies", access.academyId, "members", selectedTeacher.id), { active: selectedTeacher.active === false });
      await batch.commit();
      onFeedback(selectedTeacher.active === false ? "Acesso do professor ativado." : "Acesso do professor suspenso.");
    } catch {
      onFeedback("Não foi possível alterar o acesso do professor.");
    }
  }

  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro"><div><span>EQUIPE · GESTÃO</span><h2>Professores</h2><p>Equipe vinculada, contatos e status de acesso.</p></div></section>
      <section className="directory-layout">
        <article className="workspace-panel directory-panel">
          <header><div><span>PROFESSORES CADASTRADOS</span><h3>{teachers.length} {teachers.length === 1 ? "professor" : "professores"}</h3></div></header>
          <div className="workspace-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" /></div>
          <div className="directory-list">
            {filteredTeachers.length === 0 ? <div className="directory-empty"><UserRoundCheck /><p>{teachers.length === 0 ? "Nenhum professor cadastrado ainda." : "Nenhum professor encontrado."}</p></div> : filteredTeachers.map((teacher) => (
              <button className={selectedId === teacher.id ? "directory-row selected" : "directory-row"} key={teacher.id} onClick={() => setSelectedId(teacher.id)}>
                <i>{teacher.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</i><span><strong>{teacher.name}</strong><small>{teacher.email || "E-mail ainda não informado"}</small></span><em className={teacher.active === false ? "inactive" : ""}>{teacher.active === false ? "Suspenso" : "Ativo"}</em><ChevronRight />
              </button>
            ))}
          </div>
        </article>
        <aside className="workspace-panel student-detail-panel">
          {selectedTeacher ? <><header><div><span>PERFIL DO PROFESSOR</span><h3>Editar cadastro</h3></div><span className={selectedTeacher.active === false ? "detail-status inactive" : "detail-status"}>{selectedTeacher.active === false ? "Suspenso" : "Ativo"}</span></header><form className="student-detail-form" onSubmit={saveTeacher}><label>Nome completo<input value={editName} onChange={(event) => setEditName(event.target.value)} required /></label><label>E-mail Google<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></label><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button></form><button className="detail-toggle" onClick={toggleTeacher}>{selectedTeacher.active === false ? "Reativar acesso" : "Suspender acesso"}</button></> : <div className="directory-empty detail-empty"><UserRoundCheck /><h3>Selecione um professor</h3><p>Escolha um cadastro para visualizar e editar os dados.</p></div>}
        </aside>
      </section>
    </div>
  );
}

function StudentsModule({ onNewStudent, onFeedback }: { onNewStudent?: () => void; onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [students, setStudents] = useState<RegisteredStudent[]>([]);
  const [teachers, setTeachers] = useState<RegisteredTeacher[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPlan, setEditPlan] = useState("Mensal");
  const [editTeacherId, setEditTeacherId] = useState("");

  useEffect(() => {
    if (!db) return;
    const studentsRef = collection(db, "academies", access.academyId, "students");
    const studentsQuery = access.role === "teacher" ? query(studentsRef, where("teacherId", "==", access.userId)) : studentsRef;
    const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
      setStudents(snapshot.docs.map((student) => {
        const data = student.data() as { name?: string; email?: string | null; plan?: string; teacherId?: string | null; active?: boolean };
        return { id: student.id, name: data.name ?? "Aluno sem nome", email: data.email ?? null, plan: data.plan ?? "Sem plano", teacherId: data.teacherId ?? null, active: data.active !== false };
      }));
    }, (error) => console.error("Não foi possível carregar os alunos.", error));
    if (access.role !== "admin") return unsubscribeStudents;
    const unsubscribeTeachers = onSnapshot(collection(db, "academies", access.academyId, "teachers"), (snapshot) => {
      setTeachers(snapshot.docs.map((teacher) => {
        const data = teacher.data() as { name?: string; email?: string | null; active?: boolean };
        return { id: teacher.id, name: data.name ?? "Professor sem nome", email: data.email ?? null, active: data.active !== false };
      }));
    }, (error) => console.error("Não foi possível carregar os professores.", error));
    const unsubscribePlans = onSnapshot(collection(db, "academies", access.academyId, "plans"), (snapshot) => {
      setPlans(snapshot.docs.map((plan) => {
        const data = plan.data() as { name?: string; price?: number; active?: boolean };
        return { id: plan.id, name: data.name ?? "Plano sem nome", price: Number(data.price ?? 0), active: data.active !== false };
      }));
    }, (error) => console.error("Não foi possível carregar os planos.", error));
    return () => { unsubscribeStudents(); unsubscribeTeachers(); unsubscribePlans(); };
  }, [access.academyId, access.role, access.userId]);

  const filteredStudents = students.filter((student) => `${student.name} ${student.email ?? ""}`.toLowerCase().includes(search.toLowerCase().trim()));
  const selectedStudent = students.find((student) => student.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedStudent) return;
    setEditName(selectedStudent.name);
    setEditEmail(selectedStudent.email ?? "");
    setEditPlan(selectedStudent.plan);
    setEditTeacherId(selectedStudent.teacherId ?? "");
  }, [selectedStudent]);

  async function saveStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !selectedStudent || !editName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "academies", access.academyId, "students", selectedStudent.id), {
        name: editName.trim(),
        email: editEmail.trim() || null,
        plan: editPlan,
        ...(access.role === "admin" ? { teacherId: editTeacherId || null } : {}),
      });
      onFeedback("Dados do aluno atualizados.");
    } catch {
      onFeedback("Não foi possível atualizar este aluno.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStudent() {
    if (!db || !selectedStudent) return;
    try {
      await updateDoc(doc(db, "academies", access.academyId, "students", selectedStudent.id), { active: selectedStudent.active === false });
      onFeedback(selectedStudent.active === false ? "Acesso do aluno ativado." : "Acesso do aluno suspenso.");
    } catch {
      onFeedback("Não foi possível alterar o acesso do aluno.");
    }
  }

  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro">
        <div><span>RELACIONAMENTO · GESTÃO</span><h2>Alunos</h2><p>Cadastros, planos e status de acesso da academia.</p></div>
        {onNewStudent && <button onClick={onNewStudent}><Plus /> Novo aluno</button>}
      </section>
      <section className="directory-layout">
        <article className="workspace-panel directory-panel">
          <header><div><span>CADASTROS ATIVOS</span><h3>{students.length} {students.length === 1 ? "aluno" : "alunos"}</h3></div></header>
          <div className="workspace-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" /></div>
          <div className="directory-list">
            {filteredStudents.length === 0 ? <div className="directory-empty"><Users /><p>{students.length === 0 ? "Nenhum aluno cadastrado ainda." : "Nenhum aluno encontrado."}</p></div> : filteredStudents.map((student) => (
              <button className={selectedId === student.id ? "directory-row selected" : "directory-row"} key={student.id} onClick={() => setSelectedId(student.id)}>
                <i>{student.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</i><span><strong>{student.name}</strong><small>{student.email || "E-mail ainda não informado"}</small></span><em className={student.active === false ? "inactive" : ""}>{student.active === false ? "Suspenso" : student.plan}</em><ChevronRight />
              </button>
            ))}
          </div>
        </article>
        <aside className="workspace-panel student-detail-panel">
          {selectedStudent ? <>
            <header><div><span>PERFIL DO ALUNO</span><h3>Editar cadastro</h3></div><span className={selectedStudent.active === false ? "detail-status inactive" : "detail-status"}>{selectedStudent.active === false ? "Suspenso" : "Ativo"}</span></header>
            <form className="student-detail-form" onSubmit={saveStudent}>
              <label>Nome completo<input value={editName} onChange={(event) => setEditName(event.target.value)} required /></label>
              <label>E-mail Google<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></label>
              <label>Plano<select value={editPlan} onChange={(event) => setEditPlan(event.target.value)}><option value="Sem plano">Sem plano</option>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.name}>{plan.name} · R$ {plan.price.toFixed(2).replace(".", ",")}</option>)}</select></label>
              {access.role === "admin" && <label>Professor responsável<select value={editTeacherId} onChange={(event) => setEditTeacherId(event.target.value)}><option value="">Sem professor definido</option>{teachers.filter((teacher) => teacher.active !== false).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>}
              <button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
            </form>
            <button className="detail-toggle" onClick={toggleStudent}>{selectedStudent.active === false ? "Reativar acesso" : "Suspender acesso"}</button>
          </> : <div className="directory-empty detail-empty"><UserRoundCheck /><h3>Selecione um aluno</h3><p>Escolha um cadastro para visualizar e editar os dados.</p></div>}
        </aside>
      </section>
    </div>
  );
}

function WorkspaceModule({ title, profile, onFeedback }: { title: string; profile: "Gestão" | "Professor"; onFeedback: (message: string) => void }) {
  const content: Record<string, { kicker: string; description: string; action: string }> = {
    Alunos: { kicker: "RELACIONAMENTO", description: "Consulte alunos, planos, frequência e próximos treinos em um único lugar.", action: "Adicionar aluno" },
    Professores: { kicker: "EQUIPE", description: "Organize os professores vinculados à academia e acompanhe seus acessos.", action: "Cadastrar professor" },
    "Planos e mensalidades": { kicker: "RECEITA", description: "Crie planos, acompanhe vencimentos e organize os recebimentos da academia.", action: "Novo plano" },
    Treinos: { kicker: "PRESCRIÇÃO", description: "Monte fichas, exercícios e ciclos de treino para os alunos.", action: "Criar treino" },
    "Aulas e reservas": { kicker: "AGENDA", description: "Configure turmas, horários, vagas e reservas dos alunos.", action: "Criar aula" },
    Avaliações: { kicker: "EVOLUÇÃO", description: "Registre avaliações físicas e acompanhe a evolução dos alunos.", action: "Nova avaliação" },
  };
  const module = content[title] ?? { kicker: "MÓDULO", description: "Este espaço está pronto para receber os dados da academia.", action: "Adicionar registro" };
  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro">
        <div><span>{module.kicker} · {profile === "Gestão" ? "GESTÃO" : "PROFESSOR"}</span><h2>{title}</h2><p>{module.description}</p></div>
        <button onClick={() => onFeedback(`${module.action}: próxima etapa do módulo.`)}><Plus /> {module.action}</button>
      </section>
      <section className="module-overview-grid">
        <article className="workspace-panel module-card"><span>VISÃO DO MÓDULO</span><strong>{title}</strong><p>Os dados serão organizados aqui conforme forem cadastrados.</p><button onClick={() => onFeedback(`${title}: ação registrada.`)}>Abrir módulo <ArrowRight /></button></article>
        <article className="workspace-panel module-card"><span>PRÓXIMO PASSO</span><strong>Dados conectados</strong><p>O próximo cadastro ficará vinculado à academia atual.</p><button onClick={() => onFeedback("Configuração selecionada.")}>Configurar <ArrowRight /></button></article>
      </section>
      <div className="module-empty"><Sparkles /><h3>Área de {title.toLowerCase()}</h3><p>Esta tela já está separada no sistema. Vamos preencher suas ações específicas por etapas.</p></div>
    </div>
  );
}

function PermissionsPanel({ theme, onThemeChange, onClose, onFeedback }: { theme: Theme; onThemeChange: (theme: Theme) => void; onClose: () => void; onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [roleToAdd, setRoleToAdd] = useState<"teacher" | "student" | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const roles = [
    { id: "admin", label: "Dono / administrador", tone: "admin", description: "Controle total da academia, equipe, alunos, financeiro e configurações.", access: "Tudo" },
    { id: "teacher", label: "Professor", tone: "teacher", description: "Acompanha alunos vinculados e monta ou publica treinos.", access: "Professor + alunos" },
    { id: "student", label: "Aluno", tone: "student", description: "Acessa apenas seus treinos, evolução, agenda e perfil.", access: "Área do aluno" },
  ];

  async function generateAccessCode() {
    if (!db || !roleToAdd) return;
    setGenerating(true);
    const random = Array.from(crypto.getRandomValues(new Uint32Array(2))).map((value) => value.toString(36).toUpperCase()).join("").slice(0, 8);
    const code = `DF-${random}`;
    try {
      await setDoc(doc(db, "accessCodes", code), {
        academyId: access.academyId,
        role: roleToAdd,
        active: true,
        createdBy: access.userId,
        createdAt: serverTimestamp(),
      });
      setGeneratedCode(code);
    } catch {
      onFeedback("Não foi possível gerar o código. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="permissions-backdrop" role="dialog" aria-modal="true" aria-labelledby="permissions-title">
      <section className="permissions-panel">
        <header><div><span>CONFIGURAÇÕES DA ACADEMIA</span><h2 id="permissions-title">Configurações</h2><p>Organize equipe, permissões e aparência do ambiente.</p></div><button aria-label="Fechar configurações" onClick={onClose}><X /></button></header>
        <section className="settings-section">
          <div className="settings-section-heading"><div><span>CONTROLE DE ACESSO</span><h3>Equipe e permissões</h3></div><small>Quem pode acessar cada área</small></div>
          <div className="permission-roles">
          {roles.map((role) => <article className={`permission-role ${role.tone}`} key={role.label}><div className="permission-role-icon"><ShieldCheck /></div><div><strong>{role.label}</strong><p>{role.description}</p><span>Acesso: {role.access}</span></div><button onClick={() => role.id === "admin" ? onFeedback("O dono da academia já possui acesso administrativo.") : setRoleToAdd(role.id as "teacher" | "student")}><Plus size={16} /> Adicionar</button></article>)}
          </div>
          {roleToAdd && <div className="invite-box"><div><span>NOVO CÓDIGO</span><strong>Convite de {roleToAdd === "teacher" ? "professor" : "aluno"}</strong><p>Gere um código e envie para a pessoa entrar com a conta Google.</p></div><button onClick={generateAccessCode} disabled={generating}>{generating ? "Gerando..." : "Gerar código"}</button>{generatedCode && <div className="generated-code"><code>{generatedCode}</code><button onClick={() => navigator.clipboard?.writeText(generatedCode).then(() => onFeedback("Código copiado."))}>Copiar</button></div>}</div>}
        </section>
        <section className="settings-section appearance-section">
          <div className="settings-section-heading"><div><span>IDENTIDADE VISUAL</span><h3>Aparência</h3></div><small>Preferência deste ambiente</small></div>
          <ThemeSwitcher theme={theme} onChange={onThemeChange} />
        </section>
        <div className="permissions-note"><ShieldCheck size={18} /><span>O acesso é protegido pelo Firebase. Usuários sem vínculo ativo com esta academia não conseguem abrir os dados.</span></div>
      </section>
    </div>
  );
}

function AdminWorkspace({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const feedback = useFeedback();
  const access = useAccess();
  const [newMemberRole, setNewMemberRole] = useState<"student" | "teacher" | null>(null);
  const [registeredStudents, setRegisteredStudents] = useState<RegisteredStudent[]>([]);
  const [dashboardCharges, setDashboardCharges] = useState<MonthlyCharge[]>([]);

  useEffect(() => {
    if (!db) return;
    const unsubscribeStudents = onSnapshot(collection(db, "academies", access.academyId, "students"), (snapshot) => {
      setRegisteredStudents(snapshot.docs.map((student) => {
        const data = student.data() as { name?: string; plan?: string; active?: boolean };
        return { id: student.id, name: data.name ?? "Aluno sem nome", plan: data.plan ?? "Sem plano", active: data.active };
      }));
    }, (error) => console.error("Não foi possível atualizar a lista de alunos.", error));
    const unsubscribeCharges = onSnapshot(collection(db, "academies", access.academyId, "monthlyCharges"), (snapshot) => {
      setDashboardCharges(snapshot.docs.map((charge) => {
        const data = charge.data() as Omit<MonthlyCharge, "id">;
        const status: MonthlyCharge["status"] = data.status === "paid" ? "paid" : "pending";
        return { id: charge.id, ...data, amount: Number(data.amount ?? 0), status };
      }));
    }, (error) => console.error("Não foi possível atualizar o resumo financeiro.", error));
    return () => { unsubscribeStudents(); unsubscribeCharges(); };
  }, [access.academyId]);

  const students = registeredStudents.map((student) => ({
      initials: student.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      name: student.name,
      plan: student.plan,
      status: student.active === false ? "Inativo" : "Ativo",
      visits: "—",
      next: "A definir",
    }));
  const dashboardTotal = dashboardCharges.reduce((total, charge) => total + charge.amount, 0);
  const dashboardReceived = dashboardCharges.filter((charge) => charge.status === "paid").reduce((total, charge) => total + charge.amount, 0);
  const dashboardOverdue = dashboardCharges.filter((charge) => chargeViewStatus(charge) === "overdue");
  const dashboardOpen = dashboardCharges.filter((charge) => charge.status !== "paid").reduce((total, charge) => total + charge.amount, 0);
  const dashboardPercent = dashboardTotal ? Math.round((dashboardReceived / dashboardTotal) * 100) : 0;
  const money = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;
  return (
    <WorkspaceShell profile="Gestão" theme={theme} onThemeChange={onThemeChange} onNewStudent={() => setNewMemberRole("student")}>
      <div className="workspace-content">
        <section className="workspace-intro">
          <div><span>OPERAÇÃO DA ACADEMIA · DADOS REAIS</span><h2>Olá, {firstName(access.user.displayName, access.user.email)}.</h2><p>Uma leitura direta da operação para você decidir o que precisa de atenção hoje.</p></div>
          <button onClick={() => setNewMemberRole("student")}><Plus /> Novo aluno</button>
        </section>
        <section className="metric-grid">
          <MetricCard icon={Users} label="Alunos ativos" value={String(registeredStudents.filter((student) => student.active !== false).length)} note={`${registeredStudents.length} cadastro${registeredStudents.length === 1 ? "" : "s"} total`} />
          <MetricCard icon={CircleDollarSign} label="Receita prevista" value={money(dashboardTotal)} note={`${dashboardPercent}% já recebido`} />
          <MetricCard icon={Banknote} label="Em aberto" value={money(dashboardOpen)} note={`${dashboardCharges.filter((charge) => charge.status !== "paid").length} mensalidades`} warning={dashboardOpen > 0} />
          <MetricCard icon={Activity} label="Frequência hoje" value="—" note="Sem registros ainda" />
        </section>
        <section className="operations-grid">
          <article className="workspace-panel student-table-panel">
            <header><div><span>OPERAÇÃO</span><h3>Alunos para acompanhar</h3><p>Planos, frequência e próximos treinos.</p></div><button onClick={() => feedback("Lista completa de alunos selecionada.")}>Ver todos <ArrowRight /></button></header>
            <div className="workspace-search"><Search /><input placeholder="Buscar aluno" /></div>
            <div className="student-table">
              <div className="table-row table-head"><span>Aluno</span><span>Plano</span><span>Situação</span><span>Visitas</span><span>Próximo treino</span><span /></div>
              {students.length === 0 ? <div className="directory-empty"><Users /><p>Nenhum aluno cadastrado ainda.</p></div> : students.map((student) => (
                <div className="table-row" key={student.name}>
                  <span className="table-person"><i>{student.initials}</i><strong>{student.name}</strong></span>
                  <span>{student.plan}</span>
                  <span><em className={student.status === "Em atraso" ? "late" : student.status === "Vence hoje" ? "due" : ""}>{student.status}</em></span>
                  <span>{student.visits}</span><span>{student.next}</span><button aria-label={`Abrir ${student.name}`} onClick={() => feedback(`Perfil de ${student.name} selecionado.`)}><ChevronRight /></button>
                </div>
              ))}
            </div>
          </article>
          <aside className="workspace-panel finance-card">
            <header><div><span>FINANCEIRO</span><h3>Recebimentos do mês</h3></div><button aria-label="Mais opções"><MoreHorizontal /></button></header>
            <div className="finance-total"><small>PREVISTO</small><strong>{money(dashboardTotal)}</strong><span>{dashboardCharges.length} mensalidades cadastradas</span></div>
            <div className="finance-bar"><i style={{ width: `${dashboardPercent}%` }} /><b style={{ width: `${Math.max(0, 100 - dashboardPercent)}%` }} /></div>
            <div className="finance-legend">
              <div><span><i className="received" />Recebido</span><strong>{money(dashboardReceived)}</strong></div>
              <div><span><i className="pending" />Em aberto</span><strong>{money(dashboardOpen)}</strong></div>
              <div><span><i className="overdue" />Em atraso</span><strong>{money(dashboardOverdue.reduce((total, charge) => total + charge.amount, 0))}</strong></div>
            </div>
            <button className="outline-action" onClick={() => feedback("Módulo financeiro selecionado.")}>Abrir financeiro <ArrowRight /></button>
          </aside>
        </section>
        <section className="admin-lower">
          <article><span>AÇÕES RÁPIDAS</span><h3>O que precisa acontecer hoje</h3><div><button onClick={() => setNewMemberRole("teacher")}><UserRoundCheck />Cadastrar professor</button><button onClick={() => feedback("Montagem de ficha de treino selecionada.")}><ClipboardList />Montar ficha de treino</button><button onClick={() => feedback("Cadastro de aula selecionado.")}><CalendarDays />Criar aula</button></div></article>
          <article className="occupancy"><div><span>OCUPAÇÃO AGORA</span><strong>37 <small>alunos</small></strong></div><div className="occupancy-bars">{[25,42,58,79,94,61,38,18].map((value, index) => <i key={index} style={{height: `${value}%`}} />)}</div></article>
        </section>
      </div>
      {newMemberRole && <NewMemberModal role={newMemberRole} onClose={() => setNewMemberRole(null)} onFeedback={feedback} />}
    </WorkspaceShell>
  );
}

function NewMemberModal({ role, onClose, onFeedback }: { role: "student" | "teacher"; onClose: () => void; onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("Mensal");
  const [code, setCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !name.trim()) return;
    setSaving(true);
    setError(null);
    const random = Array.from(crypto.getRandomValues(new Uint32Array(2))).map((value) => value.toString(36).toUpperCase()).join("").slice(0, 8);
    const invitationCode = `DF-${random}`;
    try {
      await setDoc(doc(db, "accessCodes", invitationCode), {
        academyId: access.academyId,
        role,
        invitedName: name.trim(),
        invitedEmail: email.trim() || null,
        ...(role === "student" ? { plan } : {}),
        active: true,
        createdBy: access.userId,
        createdAt: serverTimestamp(),
      });
      setCode(invitationCode);
      onFeedback("Aluno cadastrado. Envie o código para ativar o acesso.");
    } catch {
      setError("Não foi possível cadastrar este aluno agora.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="permissions-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-student-title">
      <section className="student-modal">
        <header><div><span>NOVO CADASTRO</span><h2 id="new-student-title">Cadastrar {role === "student" ? "aluno" : "professor"}</h2><p>Crie o convite para o primeiro acesso.</p></div><button aria-label="Fechar cadastro" onClick={onClose}><X /></button></header>
        {!code ? (
          <form className="student-form" onSubmit={submit}>
            <label>Nome completo<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>
            <label>E-mail Google <small>(opcional)</small><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="aluno@exemplo.com" /></label>
            {role === "student" && <label>Plano<select value={plan} onChange={(event) => setPlan(event.target.value)}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></label>}
            {error && <p className="auth-status" role="status">{error}</p>}
            <div className="student-modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Salvando..." : "Cadastrar e gerar código"}</button></div>
          </form>
        ) : (
          <div className="student-invite-result"><span>CADASTRO CRIADO</span><h3>{name}</h3><p>Envie este código. A pessoa deverá entrar com o Google e informar o código uma única vez.</p><div className="generated-code"><code>{code}</code><button onClick={() => navigator.clipboard?.writeText(code).then(() => onFeedback("Código copiado."))}>Copiar</button></div><button className="student-modal-close" onClick={onClose}>Concluir</button></div>
        )}
      </section>
    </div>
  );
}

function ProfessorWorkspace() {
  const access = useAccess();
  const feedback = useFeedback();
  const [trainingOpen, setTrainingOpen] = useState(false);
  const today = [
    { time: "17:30", name: "Ana Paula Martins", focus: "Revisão · Força A", status: "Aguardando" },
    { time: "18:30", name: "Mariana Souza", focus: "Avaliação física", status: "Confirmado" },
    { time: "20:00", name: "Carlos Eduardo", focus: "Novo ciclo de treino", status: "Pendente" },
  ];
  return (
    <WorkspaceShell profile="Professor">
      {trainingOpen ? <TrainingModule onFeedback={feedback} /> : <div className="workspace-content">
        <section className="workspace-intro">
          <div><span>SEGUNDA, 1 DE SETEMBRO · DADOS DEMONSTRATIVOS</span><h2>Olá, {firstName(access.user.displayName, access.user.email)}.</h2><p>Seus alunos, no ritmo certo. Acompanhe quem precisa de treino novo, revisão ou avaliação.</p></div>
          <button onClick={() => setTrainingOpen(true)}><Plus /> Criar treino</button>
        </section>
        <section className="professor-summary">
          <article className="professor-focus">
            <span>PRÓXIMO ATENDIMENTO</span><div className="focus-time">17:30 <small>HOJE</small></div>
            <div className="focus-student"><i>AP</i><div><strong>Ana Paula Martins</strong><p>Revisão do treino Força A</p></div></div>
            <button onClick={() => feedback("Perfil da aluna selecionado.")}>Abrir perfil da aluna <ArrowRight /></button>
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
              <div className="appointment" key={item.time}><strong>{item.time}</strong><div><h4>{item.name}</h4><p>{item.focus}</p></div><em className={item.status === "Confirmado" ? "confirmed" : ""}>{item.status}</em><button aria-label="Abrir" onClick={() => feedback(`Atendimento de ${item.name} selecionado.`)}><ChevronRight /></button></div>
            ))}
          </article>
          <article className="workspace-panel attention-panel">
            <header><div><span>ACOMPANHAMENTO</span><h3>Precisam de atenção</h3></div></header>
            <div className="directory-empty"><Activity /><p>Nenhum alerta registrado ainda.</p></div>
          </article>
        </section>
      </div>}
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
  const access = useAccess();
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="student-drawer" onClick={(event) => event.stopPropagation()}>
        <header><AcademyBrand /><button aria-label="Fechar" onClick={onClose}><X /></button></header>
        <div className="drawer-profile"><span>{firstName(access.user.displayName, access.user.email).slice(0, 2).toUpperCase()}</span><div><strong>{accountName(access.user.displayName, access.user.email)}</strong><small>Aluno · plano ativo</small></div></div>
        <nav>{navItems.map(([id, Icon, label]) => <button key={id} onClick={() => { onChange(id); onClose(); }}><Icon /><span>{label}</span><ChevronRight /></button>)}</nav>
        <div className="drawer-footer"><small>TECNOLOGIA</small><strong>Orquestra Fit</strong><span>Ambiente demonstrativo</span></div>
      </aside>
    </div>
  );
}
