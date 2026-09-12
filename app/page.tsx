"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword, updateProfile } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import {
  Activity, ArrowLeft, ArrowRight, Banknote, BarChart3, Bell, CalendarDays, Camera, Check, Footprints,
  ChevronDown, ChevronRight, CircleDollarSign, ClipboardList, Clock3, Dumbbell, Flame, Gauge,
  House, LayoutDashboard, Menu, MoreHorizontal, Palette, Play, Plus, Printer, Search, Settings,
  Eye, EyeOff, PersonStanding, ShieldCheck, Sparkles, Trophy, User, UserRoundCheck, Users, WalletCards, MessageCircle, X,
} from "lucide-react";
import { useAccess } from "@/components/auth/access-context";
import { ExerciseAnatomyView, type ExerciseAnatomyData } from "@/components/workouts/exercise-anatomy-view";
import { auth, db, functions } from "@/lib/firebase/client";

type StudentTab = "inicio" | "treinos" | "evolucao" | "agenda" | "perfil";
type Role = "aluno" | "professor" | "gestao";
type Theme = "bronze" | "prata";
type AccountProfile = { name?: string; displayName?: string; photoUrl?: string; phone?: string; cnpj?: string; cpf?: string; instagramUrl?: string; siteUrl?: string };
type AcademyAnnouncement = { id: string; title: string; body: string; senderName?: string; createdAt?: { toDate?: () => Date } };
type NotificationItem = { id: string; type: "announcement" | "message" | "workout" | "dueSoon" | "overdue"; title: string; detail: string };

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

function profileStorageKey(userId: string) {
  return `orquestra-fit:profile:${userId}`;
}

function localCollectionKey(academyId: string, collectionName: string) {
  return `orquestra-fit:${academyId}:${collectionName}`;
}

function readLocalCollection<T>(academyId: string, collectionName: string): T[] {
  try {
    const stored = window.localStorage.getItem(localCollectionKey(academyId, collectionName));
    return stored ? JSON.parse(stored) as T[] : [];
  } catch {
    return [];
  }
}

function writeLocalCollection<T>(academyId: string, collectionName: string, records: T[]) {
  window.localStorage.setItem(localCollectionKey(academyId, collectionName), JSON.stringify(records));
  window.dispatchEvent(new Event("orquestra-fit:collection-updated"));
}

function navigateWorkspace(module: string, studentId?: string, search?: string) {
  window.dispatchEvent(new CustomEvent("orquestra-fit:navigate", { detail: { module, studentId, search } }));
}

function localStudentId(academyId: string, userId: string) {
  if (userId !== "local-demo") return userId;
  return readLocalCollection<{ id: string }>(academyId, "students")[0]?.id ?? userId;
}

function useRegisteredProfile() {
  const access = useAccess();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  useEffect(() => {
    if (!db) {
      const syncLocalProfile = () => {
        try {
          const stored = window.localStorage.getItem(profileStorageKey(access.userId));
          setProfile(stored ? JSON.parse(stored) as AccountProfile : null);
        } catch {
          setProfile(null);
        }
      };
      syncLocalProfile();
      window.addEventListener("orquestra-fit:profile-updated", syncLocalProfile);
      return () => window.removeEventListener("orquestra-fit:profile-updated", syncLocalProfile);
    }
    return onSnapshot(doc(db, "users", access.userId), (snapshot) => setProfile(snapshot.exists() ? snapshot.data() as AccountProfile : null));
  }, [access.userId]);
  return profile;
}

async function logout() {
  if (!auth) {
    window.dispatchEvent(new Event("orquestra-fit:local-logout"));
    return;
  }
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
  const canSwitchRole = access.accountType === "developer" || access.role === "admin";

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
        {canSwitchRole && (
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
                {activeTab === "perfil" && <Profile onNavigate={setActiveTab} theme={theme} onThemeChange={setTheme} />}
              </div>
              <StudentNav activeTab={activeTab} onChange={setActiveTab} />
              <AcademyFooter />
            </>
          )}
          {menuOpen && <StudentDrawer onClose={() => setMenuOpen(false)} onChange={setActiveTab} />}
        </section>
      )}
        {role === "professor" && <ProfessorWorkspace theme={theme} onThemeChange={setTheme} />}
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
    <div className="role-switcher" aria-label="Alternar área">
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
        <NotificationBell scope="student" className="icon-button" />
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

function normalizePublishedWorkout(id: string, data: Omit<WorkoutRecord, "id">): WorkoutRecord {
  return { id, ...data, exerciseIds: data.exerciseIds ?? [], exerciseDetails: data.exerciseDetails ?? [], status: "published" };
}

function useStudentPublishedWorkouts(enabled = true) {
  const access = useAccess();
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(db));

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    if (!db) {
      const syncLocalWorkouts = () => {
        const studentId = localStudentId(access.academyId, access.userId);
        setWorkouts(readLocalCollection<WorkoutRecord>(access.academyId, "workouts").filter((item) => item.studentId === studentId && item.status === "published"));
        setLoading(false);
      };
      syncLocalWorkouts();
      window.addEventListener("orquestra-fit:collection-updated", syncLocalWorkouts);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocalWorkouts);
    }
    setLoading(true);
    const workoutsQuery = query(collection(db, "academies", access.academyId, "workouts"), where("studentId", "==", access.userId), where("status", "==", "published"));
    return onSnapshot(workoutsQuery, (snapshot) => {
      setWorkouts(snapshot.docs.map((workout) => normalizePublishedWorkout(workout.id, workout.data() as Omit<WorkoutRecord, "id">)));
      setLoading(false);
    }, (error) => {
      console.error("Não foi possível carregar os treinos.", error);
      setLoading(false);
    });
  }, [access.academyId, access.userId, enabled]);

  return { workouts, loading };
}

function useAcademyAnnouncements() {
  const access = useAccess();
  const [announcements, setAnnouncements] = useState<AcademyAnnouncement[]>([]);
  useEffect(() => {
    if (!db) {
      const syncLocal = () => setAnnouncements(readLocalCollection<AcademyAnnouncement>(access.academyId, "announcements"));
      syncLocal();
      window.addEventListener("orquestra-fit:collection-updated", syncLocal);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocal);
    }
    return onSnapshot(collection(db, "academies", access.academyId, "announcements"), (snapshot) => {
      setAnnouncements(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AcademyAnnouncement, "id">) })).sort((a, b) => (b.createdAt?.toDate?.().getTime() ?? 0) - (a.createdAt?.toDate?.().getTime() ?? 0)));
    }, (error) => console.error("Não foi possível carregar os comunicados.", error));
  }, [access.academyId]);
  return announcements;
}

function useStudentNotificationItems(includeStudentData = true) {
  const access = useAccess();
  const announcements = useAcademyAnnouncements();
  const { workouts } = useStudentPublishedWorkouts(includeStudentData);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [charges, setCharges] = useState<MonthlyCharge[]>([]);
  useEffect(() => {
    if (!includeStudentData) { setMessages([]); setCharges([]); return; }
    if (!db) {
      const syncLocal = () => {
        const studentId = localStudentId(access.academyId, access.userId);
        setMessages(readLocalCollection<InternalMessage>(access.academyId, "messages").filter((item) => item.studentId === studentId));
        setCharges(readLocalCollection<MonthlyCharge>(access.academyId, "monthlyCharges").filter((item) => item.studentId === studentId));
      };
      syncLocal();
      window.addEventListener("orquestra-fit:collection-updated", syncLocal);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocal);
    }
    const unsubscribeMessages = onSnapshot(query(collection(db, "academies", access.academyId, "messages"), where("studentId", "==", access.userId)), (snapshot) => setMessages(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<InternalMessage, "id">) }))));
    const unsubscribeCharges = onSnapshot(query(collection(db, "academies", access.academyId, "monthlyCharges"), where("studentId", "==", access.userId)), (snapshot) => setCharges(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<MonthlyCharge, "id">), amount: Number(item.data().amount ?? 0), status: item.data().status === "paid" ? "paid" : "pending" }))));
    return () => { unsubscribeMessages(); unsubscribeCharges(); };
  }, [access.academyId, access.userId, includeStudentData]);
  const items: NotificationItem[] = [
    ...charges.filter((charge) => chargeViewStatus(charge) === "overdue").map((charge) => ({ id: `charge-${charge.id}`, type: "overdue" as const, title: "Mensalidade vencida", detail: `${charge.planName} venceu em ${formatDate(charge.dueDate)}.` })),
    ...charges.filter((charge) => chargeViewStatus(charge) === "dueSoon").map((charge) => ({ id: `charge-${charge.id}`, type: "dueSoon" as const, title: "Vencimento próximo", detail: `${charge.planName} vence em ${Math.max(daysUntil(charge.dueDate), 0)} dia(s).` })),
    ...announcements.map((item) => ({ id: `announcement-${item.id}`, type: "announcement" as const, title: item.title, detail: item.body })),
    ...messages.map((item) => ({ id: `message-${item.id}`, type: "message" as const, title: `Mensagem de ${item.senderName}`, detail: item.body })),
    ...workouts.map((item) => ({ id: `workout-${item.id}`, type: "workout" as const, title: "Novo treino disponível", detail: `${item.name} foi publicado para você.` })),
  ];
  return items;
}

function NotificationBell({ scope, className }: { scope: "student" | "workspace"; className?: string }) {
  const items = useStudentNotificationItems(scope === "student");
  const access = useAccess();
  const [open, setOpen] = useState(false);
  const seenKey = `orquestra-fit:notifications-seen:${access.userId}`;
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => { try { setSeen(JSON.parse(window.localStorage.getItem(seenKey) ?? "[]") as string[]); } catch { setSeen([]); } }, [seenKey]);
  const unread = items.filter((item) => !seen.includes(item.id)).length;
  const toggle = () => {
    setOpen((current) => !current);
    if (!open) {
      const ids = items.map((item) => item.id);
      setSeen(ids);
      window.localStorage.setItem(seenKey, JSON.stringify(ids));
    }
  };
  return <div className={`notification-anchor ${scope}`}>
    <button aria-label={unread ? `Notificações, ${unread} nova(s)` : "Notificações"} className={className} onClick={toggle}><Bell size={20} />{unread > 0 && <b className="notification-count">{Math.min(unread, 9)}</b>}</button>
    {open && <aside className="notification-panel" aria-label="Central de notificações"><header><div><span>CENTRAL</span><strong>Notificações</strong></div><button aria-label="Fechar notificações" onClick={() => setOpen(false)}><X /></button></header><div>{items.length ? items.slice(0, 12).map((item) => <article className={item.type} key={item.id}><i /> <div><strong>{item.title}</strong><p>{item.detail}</p></div></article>) : <div className="notification-empty"><Bell /><span>Nenhuma novidade no momento.</span></div>}</div></aside>}
  </div>;
}

function escapePrintText(value: string | number | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function printWorkoutSheet(workout: WorkoutRecord) {
  const printWindow = window.open("", "_blank", "width=900,height=720");
  if (!printWindow) return;
  const exercises = workout.exerciseDetails ?? [];
  const exerciseRows = exercises.length > 0
    ? exercises.map((exercise, index) => `<tr><td><b>${index + 1}. ${escapePrintText(exercise.name)}</b>${exercise.muscleGroup ? `<small>${escapePrintText(exercise.muscleGroup)}</small>` : ""}${exercise.instructions ? `<small>${escapePrintText(exercise.instructions)}</small>` : ""}</td><td>${escapePrintText(exercise.sets)}</td><td>${escapePrintText(exercise.reps)}</td><td>${escapePrintText(exercise.load || "—")}</td><td>${escapePrintText(exercise.rest)}s</td></tr>`).join("")
    : `<tr><td colspan="5">Exercícios vinculados: ${workout.exerciseIds.length}</td></tr>`;
  const printedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());
  printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapePrintText(workout.name)} - ${escapePrintText(workout.studentName)}</title><style>@page{margin:5mm}*{box-sizing:border-box}body{margin:0 auto;max-width:190mm;color:#111;background:#fff;font-family:Arial,sans-serif;font-size:10pt}header{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}header strong{display:block;font-family:Georgia,serif;font-size:16pt}header span{display:block;font-size:8pt;letter-spacing:.18em;margin-top:2px}h1{font-family:Georgia,serif;font-size:15pt;margin:0 0 3px}.student{margin:0 0 12px;font-size:9pt}.student b{display:block;font-size:11pt}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border-bottom:1px solid #bbb;padding:6px 3px;text-align:center;vertical-align:top}th{font-size:7.5pt;text-transform:uppercase}th:first-child,td:first-child{text-align:left;width:48%}td b,td small{display:block}td small{font-size:7.5pt;line-height:1.3;margin-top:2px;color:#333}footer{margin-top:12px;padding-top:8px;border-top:1px dashed #777;text-align:center;font-size:7.5pt}.no-print{display:block;width:100%;margin:16px 0;padding:10px;border:0;background:#111;color:#fff;font-weight:bold}@media print{.no-print{display:none}}@media(max-width:90mm){body{font-size:8pt}header strong{font-size:13pt}h1{font-size:12pt}th,td{padding:4px 2px}th:first-child,td:first-child{width:44%}}</style></head><body><header><strong>DAMA DE FERRO</strong><span>ACADEMIA · ORQUESTRA FIT</span></header><main><h1>${escapePrintText(workout.name)}</h1><p class="student"><span>ALUNO</span><b>${escapePrintText(workout.studentName)}</b></p><table><thead><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Carga</th><th>Desc.</th></tr></thead><tbody>${exerciseRows}</tbody></table></main><footer>Impresso em ${escapePrintText(printedAt)} · Orientações e cargas podem ser ajustadas pelo professor.</footer><button class="no-print" onclick="window.print()">Imprimir treino</button></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

function StudentHome({ onStart, onEvolution }: { onStart: (workout?: WorkoutRecord) => void; onEvolution: () => void }) {
  const access = useAccess();
  const { workouts, loading } = useStudentPublishedWorkouts();
  const workout = workouts[0];
  const exerciseCount = workout?.exerciseDetails?.length || workout?.exerciseIds.length || 0;
  const totalSets = workout?.exerciseDetails?.reduce((total, exercise) => total + (Number(exercise.sets) || 0), 0) ?? 0;
  return (
    <div className="student-view home-view">
      <section className="welcome-row">
        <div><p>SEGUNDA, 1 DE SETEMBRO</p><h1>Olá, {firstName(access.user.displayName, access.user.email)}.</h1><span>Seu ritmo começa aqui.</span></div>
        <div className="streak" aria-label="Sequência de treinos"><Flame size={20} /><strong>—</strong><small>sem histórico</small></div>
      </section>

      <article className="today-workout">
        <div className="workout-copy">
          <div className="eyebrow"><span /> TREINO DE HOJE</div>
          <h2>{loading ? "Carregando seu treino" : workout?.name ?? "Nenhum treino publicado"}</h2>
          <p>{loading ? "Buscando sua ficha atual." : workout ? `Ficha publicada para você com ${exerciseCount} ${exerciseCount === 1 ? "exercício" : "exercícios"}.` : "Seu professor ainda não publicou um treino."}</p>
          <div className="workout-meta">
            <span><Clock3 size={16} /> {workout ? `${totalSets || "—"} séries` : "Aguardando"}</span>
            <span><Dumbbell size={16} /> {workout ? `${exerciseCount} exercícios` : "Sem exercícios"}</span>
          </div>
          <button disabled={loading || !workout} onClick={() => workout && onStart(workout)}>{loading ? "Carregando..." : workout ? "Iniciar treino" : "Treino indisponível"} <ArrowRight size={19} /></button>
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
          <div><small>Frequência</small><strong>Sem registros</strong><p>Os acessos aparecerão aqui.</p></div>
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
          <div className="weekly-score"><Gauge size={24} /><div><strong>Sem histórico</strong><span>treinos concluídos</span></div></div>
        </article>
      </section>

      <StudentMessagesInbox />

      <StudentAnnouncementCard />
    </div>
  );
}

function StudentPaymentStatus() {
  const access = useAccess();
  const feedback = useFeedback();
  const [charges, setCharges] = useState<MonthlyCharge[]>([]);

  useEffect(() => {
    if (!db) {
      const syncLocalCharges = () => {
        const studentId = localStudentId(access.academyId, access.userId);
        setCharges(readLocalCollection<MonthlyCharge>(access.academyId, "monthlyCharges").filter((item) => item.studentId === studentId));
      };
      syncLocalCharges();
      window.addEventListener("orquestra-fit:collection-updated", syncLocalCharges);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocalCharges);
    }
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

function StudentMessagesInbox() {
  const access = useAccess();
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  useEffect(() => {
    if (!db) {
      const syncLocalMessages = () => {
        const studentId = localStudentId(access.academyId, access.userId);
        setMessages(readLocalCollection<InternalMessage>(access.academyId, "messages").filter((item) => item.studentId === studentId));
      };
      syncLocalMessages();
      window.addEventListener("orquestra-fit:collection-updated", syncLocalMessages);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocalMessages);
    }
    return onSnapshot(query(collection(db, "academies", access.academyId, "messages"), where("studentId", "==", access.userId)), (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<InternalMessage, "id">) })).sort((a, b) => (b.createdAt?.toDate?.().getTime() ?? 0) - (a.createdAt?.toDate?.().getTime() ?? 0)));
    });
  }, [access.academyId, access.userId]);
  const message = messages[0];
  return <article className="student-message-inbox"><div className="student-message-inbox-icon"><MessageCircle /></div><div><small>COMUNICADO DA EQUIPE</small><strong>{message ? message.senderName : "Nenhuma mensagem nova"}</strong><p>{message?.body ?? "Quando seu professor enviar uma orientação, ela aparecerá aqui."}</p></div></article>;
}

function StudentAnnouncementCard() {
  const announcements = useAcademyAnnouncements();
  const latest = announcements[0];
  return <article className="academy-note">
    <div className="note-mark">DF</div>
    <div><span>COMUNICADO DA ACADEMIA</span><h3>{latest?.title ?? "Boas-vindas à Dama de Ferro"}</h3><p>{latest?.body ?? "Os avisos gerais da gestão aparecerão aqui e nas notificações."}</p></div>
    <ChevronRight />
  </article>;
}

function WorkoutLibrary({ onStart }: { onStart: (workout?: WorkoutRecord) => void }) {
  const { workouts: publishedWorkouts, loading } = useStudentPublishedWorkouts();
  return (
    <div className="student-view">
      <PageIntro kicker="PROGRAMA ATUAL" title="Seus treinos" copy="Um plano construído para evoluir com consistência." />
      <div className="program-summary">
        <div><small>Ciclo</small><strong>Nenhum ciclo ativo</strong></div><span>AGUARDANDO</span>
        <div className="program-line"><i /></div>
      </div>
      <div className="workout-list">
        {publishedWorkouts.length > 0 ? publishedWorkouts.map((workout, index) => (
          <article key={workout.id} className={index === 0 ? "workout-library-card active" : "workout-library-card"}>
            <button className="workout-open" type="button" onClick={() => onStart(workout)}><span className="workout-index">0{index + 1}</span><div><small>{index === 0 ? "PROGRAMADO PARA HOJE" : "TREINO PUBLICADO"}</small><strong>{workout.name}</strong><p>{workout.exerciseIds.length} exercícios</p></div><span className="play-button"><Play size={18} fill="currentColor" /></span></button>
            <button className="workout-print" type="button" onClick={() => printWorkoutSheet(workout)}><Printer size={16} /> Imprimir</button>
          </article>
        )) : <div className="directory-empty"><Dumbbell /><p>{loading ? "Carregando seus treinos..." : "Nenhum treino publicado ainda."}</p></div>}
      </div>
    </div>
  );
}

function Evolution() {
  const access = useAccess();
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [executions, setExecutions] = useState<WorkoutExecution[]>([]);
  useEffect(() => {
    if (!db) {
      const syncLocalEvolution = () => {
        const studentId = localStudentId(access.academyId, access.userId);
        setAssessments(readLocalCollection<AssessmentRecord>(access.academyId, "assessments").filter((item) => item.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date)));
        setExecutions(readLocalCollection<WorkoutExecution>(access.academyId, "workoutExecutions").filter((item) => item.studentId === studentId));
      };
      syncLocalEvolution();
      window.addEventListener("orquestra-fit:collection-updated", syncLocalEvolution);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocalEvolution);
    }
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
  const [attendanceIds, setAttendanceIds] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState(0);
  useEffect(() => {
    if (!db) {
      const studentId = localStudentId(access.academyId, access.userId);
      setClasses(readLocalCollection<ClassRecord>(access.academyId, "classes").filter((item) => item.active));
      setReservationIds(readLocalCollection<{ classId: string; studentId: string; status: string }>(access.academyId, "reservations").filter((item) => item.studentId === studentId && item.status === "active").map((item) => item.classId));
      setAttendanceIds(readLocalCollection<{ classId: string; studentId: string }>(access.academyId, "attendance").filter((item) => item.studentId === studentId).map((item) => item.classId));
      return;
    }
    const unsubscribeClasses = onSnapshot(collection(db, "academies", access.academyId, "classes"), (snapshot) => {
      setClasses(snapshot.docs.map((item) => { const data = item.data() as Partial<ClassRecord>; return { id: item.id, name: data.name ?? "Aula", instructor: data.instructor ?? "Equipe", date: data.date ?? "", time: data.time ?? "", capacity: Number(data.capacity ?? 10), active: data.active !== false }; }).filter((item) => item.active));
    });
    const reservationQuery = query(collection(db, "academies", access.academyId, "reservations"), where("studentId", "==", access.userId), where("status", "==", "active"));
    const unsubscribeReservations = onSnapshot(reservationQuery, (snapshot) => setReservationIds(snapshot.docs.map((item) => (item.data() as { classId: string }).classId)));
    const attendanceQuery = query(collection(db, "academies", access.academyId, "attendance"), where("studentId", "==", access.userId));
    const unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => setAttendanceIds(snapshot.docs.map((item) => (item.data() as { classId: string }).classId)));
    return () => { unsubscribeClasses(); unsubscribeReservations(); unsubscribeAttendance(); };
  }, [access.academyId, access.userId]);

  async function reserve(item: ClassRecord) {
    if (!db) {
      const studentId = localStudentId(access.academyId, access.userId);
      const reservations = readLocalCollection<{ id: string; classId: string; studentId: string; status: string }>(access.academyId, "reservations");
      writeLocalCollection(access.academyId, "reservations", [...reservations, { id: `local-reservation-${Date.now()}`, classId: item.id, studentId, status: "active" }]);
      setReservationIds((current) => [...current, item.id]);
      feedback("Reserva confirmada no modo local.");
      return;
    }
    try {
      await addDoc(collection(db, "academies", access.academyId, "reservations"), { classId: item.id, className: item.name, studentId: access.userId, studentName: accountName(access.user.displayName, access.user.email), status: "active", createdAt: serverTimestamp() });
      feedback("Reserva confirmada.");
    } catch { feedback("Não foi possível reservar esta aula."); }
  }

  async function cancel(item: ClassRecord) {
    if (!db) {
      const studentId = localStudentId(access.academyId, access.userId);
      const reservations = readLocalCollection<{ id: string; classId: string; studentId: string; status: string }>(access.academyId, "reservations").map((reservation) => reservation.classId === item.id && reservation.studentId === studentId && reservation.status === "active" ? { ...reservation, status: "canceled" } : reservation);
      writeLocalCollection(access.academyId, "reservations", reservations);
      setReservationIds((current) => current.filter((id) => id !== item.id));
      feedback("Reserva cancelada no modo local.");
      return;
    }
    const firestore = db;
    try {
      const reservationSnapshot = await new Promise<string | null>((resolve) => {
        const unsubscribe = onSnapshot(query(collection(firestore, "academies", access.academyId, "reservations"), where("classId", "==", item.id), where("studentId", "==", access.userId), where("status", "==", "active")), (snapshot) => { unsubscribe(); resolve(snapshot.docs[0]?.id ?? null); });
      });
      if (reservationSnapshot) await updateDoc(doc(firestore, "academies", access.academyId, "reservations", reservationSnapshot), { status: "canceled" });
      feedback("Reserva cancelada.");
    } catch { feedback("Não foi possível cancelar a reserva."); }
  }

  async function checkIn(item: ClassRecord) {
    if (!reservationIds.includes(item.id) || attendanceIds.includes(item.id)) return;
    if (!db) {
      const studentId = localStudentId(access.academyId, access.userId);
      const attendance = readLocalCollection<{ id: string; classId: string; studentId: string }>(access.academyId, "attendance");
      writeLocalCollection(access.academyId, "attendance", [...attendance, { id: `local-attendance-${Date.now()}`, classId: item.id, studentId }]);
      setAttendanceIds((current) => [...current, item.id]);
      feedback("Presença registrada no modo local.");
      return;
    }
    try {
      await addDoc(collection(db, "academies", access.academyId, "attendance"), { classId: item.id, className: item.name, studentId: access.userId, studentName: accountName(access.user.displayName, access.user.email), date: item.date, time: item.time, createdAt: serverTimestamp() });
      feedback("Presença registrada.");
    } catch { feedback("Não foi possível registrar sua presença."); }
  }

  return (
    <div className="student-view">
      <PageIntro kicker="AULAS E RESERVAS" title="Sua agenda" copy="Organize a semana sem perder o ritmo." />
      <div className="date-selector">{["SEG\n01", "TER\n02", "QUA\n03", "QUI\n04", "SEX\n05"].map((day, index) => <button className={selectedDay === index ? "active" : ""} key={day} onClick={() => setSelectedDay(index)}>{day.split("\n").map((part) => <span key={part}>{part}</span>)}</button>)}</div>
      {classes.length === 0 ? <div className="empty-agenda"><CalendarDays /><h3>Nenhuma aula disponível</h3><p>As próximas turmas da academia aparecerão aqui.</p></div> : classes.map((item) => { const reserved = reservationIds.includes(item.id); const checkedIn = attendanceIds.includes(item.id); return <article className="class-card" key={item.id}><div className="class-time"><strong>{item.time}</strong><span>{item.capacity} vagas</span></div><div><small>{item.name.toUpperCase()}</small><h2>{item.name}</h2><p>{item.instructor} · {item.date}</p></div><div className="class-card-actions"><button onClick={() => reserved ? cancel(item) : reserve(item)}>{reserved ? "Cancelar reserva" : "Reservar"}</button>{reserved && <button className="secondary-action" disabled={checkedIn} onClick={() => void checkIn(item)}>{checkedIn ? "Presença registrada" : "Registrar presença"}</button>}</div></article>; })}
    </div>
  );
}

function PasswordUpdateForm() {
  const access = useAccess();
  const feedback = useFeedback();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hasPasswordAccess = access.user.providerData?.some((provider) => provider.providerId === "password") === true;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !access.user.email) {
      feedback("A troca de senha fica disponível no acesso real da academia.");
      return;
    }
    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      feedback("Use uma senha com ao menos 10 caracteres, incluindo letras e números.");
      return;
    }
    if (newPassword !== confirmation) {
      feedback("A confirmação da nova senha não confere.");
      return;
    }
    setSubmitting(true);
    try {
      await reauthenticateWithCredential(access.user, EmailAuthProvider.credential(access.user.email, currentPassword));
      await updatePassword(access.user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      feedback("Senha atualizada com segurança.");
    } catch (error) {
      const code = (error as { code?: string }).code;
      feedback(code === "auth/wrong-password" || code === "auth/invalid-credential"
        ? "A senha atual não confere."
        : "Não foi possível atualizar a senha. Entre novamente e tente de novo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasPasswordAccess) {
    return <div className="password-access-note"><strong>Entrada pelo Google</strong><span>Esta conta usa Google para entrar e não possui uma senha separada no Orquestra Fit.</span></div>;
  }

  return <form className="password-update-form" onSubmit={submit}>
    <strong>Atualizar senha</strong>
    <span>Use uma senha nova com pelo menos 10 caracteres, letras e números.</span>
    <label>Senha atual<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
    <label>Nova senha<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={10} required /></label>
    <label>Confirmar nova senha<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={10} required /></label>
    <button className="detail-save" type="submit" disabled={submitting}>{submitting ? "Atualizando..." : "Atualizar senha"}</button>
  </form>;
}

function Profile({ onNavigate, theme, onThemeChange }: { onNavigate: (tab: StudentTab) => void; theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const access = useAccess();
  const profile = useRegisteredProfile();
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const links = [
    { icon: User, label: "Dados pessoais" },
    { icon: WalletCards, label: "Plano e mensalidades" },
    { icon: Activity, label: "Avaliações físicas" },
    { icon: ShieldCheck, label: "Privacidade e segurança" },
    { icon: Palette, label: "Aparência" },
  ];
  function handleLink(label: string) {
    if (label === "Avaliações físicas") {
      onNavigate("evolucao");
      return;
    }
    setOpenPanel((current) => current === label ? null : label);
  }
  return (
    <div className="student-view profile-view">
      <div className="profile-identity"><StudentProfilePhoto profile={profile} /><small>ALUNO</small><h1>{accountName(profile?.name || profile?.displayName || access.user.displayName, access.user.email)}</h1><p>Conta vinculada à academia</p></div>
      {links.map(({ icon: Icon, label }) => <div key={label}><button className="profile-link" type="button" onClick={() => handleLink(label)}><Icon /><span>{label}</span><ChevronRight className={openPanel === label ? "profile-chevron-open" : ""} /></button>{openPanel === label && <div className="profile-detail-card">{label === "Dados pessoais" && <><strong>{accountName(access.user.displayName, access.user.email)}</strong><span>{access.user.email?.endsWith("@accounts.orquestra-fit.local") ? `Login: ${access.user.displayName ?? "usuário da academia"}` : access.user.email || "E-mail não informado"}</span><small>Esses dados são vinculados à sua conta da academia.</small></>}{label === "Plano e mensalidades" && <StudentPlanPanel />}{label === "Privacidade e segurança" && <><strong>Acesso protegido</strong><span>O acesso é protegido pelo Firebase. Sua senha nunca é salva no aplicativo.</span><PasswordUpdateForm /></>}{label === "Aparência" && <><strong>Tema do ambiente</strong><ThemeSwitcher theme={theme} onChange={onThemeChange} /></>}</div>}</div>)}
      <div className="powered-by"><span>Plataforma</span><strong>Orquestra Fit</strong><small>acesso protegido por código</small></div>
      <button className="profile-link" type="button" onClick={() => void logout()}><ShieldCheck /><span>Sair com segurança</span><ChevronRight /></button>
    </div>
  );
}

function WorkoutSession({ workout, completedSets, onBack, onToggleSet }: { workout?: WorkoutRecord; completedSets: string[]; onBack: () => void; onToggleSet: (id: string) => void }) {
  const access = useAccess();
  const feedback = useFeedback();
  const exercises = workout?.exerciseDetails?.length ? workout.exerciseDetails.map((exercise) => ({ name: exercise.name, group: exercise.muscleGroup || "Treino", secondaryMuscles: exercise.secondaryMuscles, anatomyRegion: exercise.anatomyRegion, bodyRegion: exercise.bodyRegion, instructions: exercise.instructions, videoUrl: exercise.videoUrl, sets: Number(exercise.sets) || 1, reps: exercise.reps || "10", load: exercise.load || "0", rest: `${exercise.rest || "60"} s` })) : workoutPlan;
  const totalSets = exercises.reduce((sum, item) => sum + item.sets, 0);
  const progress = Math.round((completedSets.length / totalSets) * 100);
  const [seconds, setSeconds] = useState(0);
  const [setValues, setSetValues] = useState<Record<string, { load: string; reps: string }>>({});
  const [saving, setSaving] = useState(false);
  const [anatomyExercise, setAnatomyExercise] = useState<ExerciseAnatomyData | null>(null);
  const [anatomyProfile, setAnatomyProfile] = useState<"masculino" | "feminino">("masculino");
  const [openExerciseIndex, setOpenExerciseIndex] = useState<number | null>(0);
  const [restTimer, setRestTimer] = useState<{ exerciseIndex: number; total: number; remaining: number } | null>(null);
  const closeAnatomy = useCallback(() => setAnatomyExercise(null), []);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const studentId = localStudentId(access.academyId, access.userId);
    const setProfile = (value?: string) => setAnatomyProfile(value === "feminino" ? "feminino" : "masculino");
    if (!db) {
      setProfile(readLocalCollection<RegisteredStudent>(access.academyId, "students").find((student) => student.id === studentId)?.anatomyProfile);
      return;
    }
    return onSnapshot(doc(db, "academies", access.academyId, "students", studentId), (snapshot) => setProfile(snapshot.data()?.anatomyProfile));
  }, [access.academyId, access.userId]);
  useEffect(() => {
    if (!restTimer) return;
    if (restTimer.remaining <= 0) {
      setRestTimer(null);
      feedback("Descanso concluído. Bora para a próxima série.");
      return;
    }
    const timer = window.setTimeout(() => setRestTimer((current) => current ? { ...current, remaining: current.remaining - 1 } : null), 1000);
    return () => window.clearTimeout(timer);
  }, [restTimer, feedback]);
  useEffect(() => {
    if (openExerciseIndex === null) return;
    const currentExercise = exercises[openExerciseIndex];
    if (currentExercise && Array.from({ length: currentExercise.sets }).every((_, setIndex) => completedSets.includes(`${openExerciseIndex}-${setIndex}`))) setOpenExerciseIndex(null);
  }, [completedSets, exercises, openExerciseIndex]);
  const elapsed = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, [seconds]);
  const restLabel = (secondsToFormat: number) => `${String(Math.floor(secondsToFormat / 60)).padStart(2, "0")}:${String(secondsToFormat % 60).padStart(2, "0")}`;
  function startRest(exerciseIndex: number) {
    const configuredSeconds = Math.max(1, Number(String(exercises[exerciseIndex].rest).replace(/[^0-9]/g, "")) || 60);
    setRestTimer({ exerciseIndex, total: configuredSeconds, remaining: configuredSeconds });
  }
  function toggleSet(exerciseIndex: number, setIndex: number) {
    const id = `${exerciseIndex}-${setIndex}`;
    const done = completedSets.includes(id);
    onToggleSet(id);
    if (!done) startRest(exerciseIndex);
  }

  async function finishWorkout() {
    if (completedSets.length < totalSets || saving) return;
    const sets = exercises.flatMap((exercise, exerciseIndex) => Array.from({ length: exercise.sets }).map((_, setIndex) => {
      const id = `${exerciseIndex}-${setIndex}`;
      const value = setValues[id] ?? { load: exercise.load, reps: exercise.reps };
      return { exerciseName: exercise.name, setNumber: setIndex + 1, load: value.load, reps: value.reps };
    }));
    if (!workout || !db) {
      if (workout) {
        const execution: WorkoutExecution = { id: `local-execution-${Date.now()}`, workoutId: workout.id, workoutName: workout.name, studentId: access.userId === "local-demo" ? localStudentId(access.academyId, access.userId) : access.userId, durationSeconds: seconds, completedSets: completedSets.length, totalSets, sets };
        const executions = readLocalCollection<WorkoutExecution>(access.academyId, "workoutExecutions");
        writeLocalCollection(access.academyId, "workoutExecutions", [execution, ...executions]);
      }
      feedback("Treino concluído.");
      onBack();
      return;
    }
    setSaving(true);
    try {
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
        {exercises.map((exercise, exerciseIndex) => {
          const isOpen = openExerciseIndex === exerciseIndex;
          const completedCount = Array.from({ length: exercise.sets }).filter((_, setIndex) => completedSets.includes(`${exerciseIndex}-${setIndex}`)).length;
          const isComplete = completedCount === exercise.sets;
          const isResting = restTimer?.exerciseIndex === exerciseIndex;
          return <article className={`exercise-card ${isOpen ? "expanded" : "collapsed"} ${isComplete ? "completed" : ""}`} key={exercise.name}>
            <header><button className="exercise-card-title" type="button" aria-expanded={isOpen} onClick={() => setOpenExerciseIndex(isOpen ? null : exerciseIndex)}><span>0{exerciseIndex + 1}</span><div><small>{exercise.group}</small><h2>{exercise.name}</h2>{!isOpen && <em>{isComplete ? "Exercício concluído" : `${completedCount}/${exercise.sets} séries concluídas`}</em>}</div><ChevronDown /></button><button className="exercise-video-button" type="button" aria-label="Ver demonstração" onClick={() => exercise.videoUrl ? window.open(exercise.videoUrl, "_blank", "noopener,noreferrer") : feedback("Este exercício ainda não possui vídeo de demonstração.")}><Play size={17} fill="currentColor" /></button></header>
            {isOpen ? <div className="exercise-card-body">
              {("instructions" in exercise && (exercise.instructions || exercise.anatomyRegion || exercise.videoUrl)) && <div className="exercise-guidance"><strong>{exercise.anatomyRegion || exercise.group}</strong>{exercise.instructions && <p><b>Como executar:</b> {exercise.instructions}</p>}{exercise.videoUrl && <a href={exercise.videoUrl} target="_blank" rel="noreferrer">Assistir demonstração</a>}</div>}
              <button className="exercise-anatomy-trigger" type="button" onClick={() => setAnatomyExercise({ name: exercise.name, primaryMuscle: exercise.anatomyRegion || exercise.group, secondaryMuscles: "secondaryMuscles" in exercise ? exercise.secondaryMuscles : undefined, anatomyProfile, sets: exercise.sets, reps: exercise.reps, rest: exercise.rest })}><PersonStanding /> Ver músculos e detalhes <ChevronRight /></button>
              <div className="set-labels"><span>Série</span><span>Carga</span><span>Repetições</span><span>Feito</span></div>
              {Array.from({ length: exercise.sets }).map((_, setIndex) => {
                const id = `${exerciseIndex}-${setIndex}`;
                const done = completedSets.includes(id);
                return <div className={done ? "set-row done" : "set-row"} key={id}><strong>{setIndex + 1}</strong><label><input value={setValues[id]?.load ?? exercise.load} onChange={(event) => setSetValues((current) => ({ ...current, [id]: { load: event.target.value, reps: current[id]?.reps ?? exercise.reps } }))} inputMode="numeric" aria-label="Carga" /><span>kg</span></label><label><input value={setValues[id]?.reps ?? exercise.reps} onChange={(event) => setSetValues((current) => ({ ...current, [id]: { load: current[id]?.load ?? exercise.load, reps: event.target.value } }))} inputMode="numeric" aria-label="Repetições" /><span>rep</span></label><button aria-label={`Concluir série ${setIndex + 1}`} onClick={() => toggleSet(exerciseIndex, setIndex)}>{done && <Check size={18} />}</button></div>;
              })}
              <footer><button className={isResting ? "rest-button running" : "rest-button"} type="button" onClick={() => isResting ? setRestTimer(null) : startRest(exerciseIndex)}><Clock3 size={16} /><span>{isResting ? `Descansando · ${restLabel(restTimer.remaining)}` : `Iniciar descanso · ${exercise.rest}`}</span><strong>{isResting ? "Parar" : "Iniciar"}</strong></button></footer>
            </div> : <button className="exercise-card-start" type="button" onClick={() => setOpenExerciseIndex(exerciseIndex)}>{isComplete ? <><Check /> Concluído</> : <><Play fill="currentColor" /> Iniciar exercício</>}<ChevronRight /></button>}
          </article>;
        })}
      </div>
      <button className="finish-workout" disabled={completedSets.length < totalSets || saving} onClick={finishWorkout}><Trophy size={20} /> {saving ? "Salvando treino..." : "Concluir treino"}</button>
      {anatomyExercise && <ExerciseAnatomyView exercise={anatomyExercise} onClose={closeAnatomy} />}
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
  phone?: string | null;
  cpf?: string | null;
  plan: string;
  teacherId?: string | null;
  anatomyProfile?: "masculino" | "feminino";
  active?: boolean;
};
type InternalMessage = { id: string; studentId: string; senderId: string; senderName: string; body: string; createdAt?: { toDate?: () => Date } };

type RegisteredTeacher = {
  id: string;
  name: string;
  email?: string | null;
  active?: boolean;
};

function WorkspaceShell({ children, profile, theme, onThemeChange, onNewStudent }: { children: React.ReactNode; profile: "Gestão" | "Professor"; theme?: Theme; onThemeChange?: (theme: Theme) => void; onNewStudent?: () => void }) {
  const access = useAccess();
  const registeredProfile = useRegisteredProfile();
  const operatorName = registeredProfile?.name?.trim() || registeredProfile?.displayName?.trim() || accountName(access.user.displayName, access.user.email);
  const operatorInitials = operatorName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const feedback = useFeedback();
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeModule, setActiveModule] = useState("Visão geral");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [focusStudentId, setFocusStudentId] = useState<string | null>(null);
  const [focusSearch, setFocusSearch] = useState("");
  function navigateToModule(module: string, studentId?: string) {
    if (profile === "Professor" && module === "Planos e mensalidades") {
      feedback("O módulo financeiro é exclusivo da gestão.");
      return;
    }
    setFocusStudentId(studentId ?? null);
    setFocusSearch("");
    setActiveModule(module);
  }
  useEffect(() => {
    const handleNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ module?: string; studentId?: string; search?: string }>).detail;
      if (!detail?.module) return;
      if (profile === "Professor" && detail.module === "Planos e mensalidades") {
        feedback("O módulo financeiro é exclusivo da gestão.");
        return;
      }
      setFocusStudentId(detail.studentId ?? null);
      setFocusSearch(detail.search ?? "");
      setActiveModule(detail.module);
    };
    window.addEventListener("orquestra-fit:navigate", handleNavigation);
    return () => window.removeEventListener("orquestra-fit:navigate", handleNavigation);
  }, [feedback, profile]);
  useEffect(() => {
    if (profile === "Professor" && activeModule === "Planos e mensalidades") setActiveModule("Visão geral");
  }, [activeModule, profile]);
  const visibleNav = profile === "Professor"
    ? workspaceNav.filter(([label]) => ["Visão geral", "Alunos", "Treinos", "Aulas e reservas", "Avaliações"].includes(label))
    : workspaceNav;
  return (
    <section className="workspace-shell" data-access-role={access.role}>
      <aside className="workspace-rail">
        <AcademyBrand />
        <nav>
          {visibleNav.map(([label, Icon]) => (
            <button key={label} className={activeModule === label ? "active" : ""} onClick={() => navigateToModule(label)}><Icon /><span>{label}</span></button>
          ))}
        </nav>
        {(profile === "Gestão" || profile === "Professor") && <button className="rail-settings" onClick={() => profile === "Gestão" ? setPermissionsOpen(true) : setAppearanceOpen(true)}><Settings /><span>Configurações</span></button>}
        <div className="rail-powered"><small>PLATAFORMA</small><strong>Orquestra Fit</strong></div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-heading"><button className="workspace-mobile-menu" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><Menu /></button><div><span>DAMA DE FERRO ACADEMIA</span><h1>{activeModule === "Visão geral" ? (profile === "Gestão" ? "Visão geral" : "Área do professor") : activeModule}</h1></div></div>
          <div className="workspace-actions">
            {searchOpen && <form className="workspace-search-inline" onSubmit={(event) => { event.preventDefault(); const term = searchTerm.trim(); if (!term) { feedback("Digite algo para pesquisar."); return; } navigateWorkspace("Alunos", undefined, term); setSearchOpen(false); }}><input autoFocus value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Pesquisar alunos" aria-label="Pesquisar alunos" /></form>}
            <button aria-label="Buscar" onClick={() => setSearchOpen((open) => !open)}><Search /></button>
            <NotificationBell scope="workspace" />
            <button className="operator" type="button" onClick={() => setProfileOpen(true)} title="Abrir perfil"><span>{registeredProfile?.photoUrl ? <img src={registeredProfile.photoUrl} alt="" /> : operatorInitials}</span><div><strong>{operatorName}</strong><small>{profile}</small></div></button>
          </div>
        </header>
        {activeModule === "Visão geral" ? children : activeModule === "Alunos" ? <StudentsModule onNewStudent={onNewStudent} onFeedback={feedback} onNavigate={navigateToModule} initialSearch={focusSearch} /> : activeModule === "Professores" ? <TeachersModule onFeedback={feedback} /> : activeModule === "Planos e mensalidades" ? <BillingModule onFeedback={feedback} initialStudentId={focusStudentId ?? ""} /> : activeModule === "Treinos" ? <TrainingModule onFeedback={feedback} initialStudentId={focusStudentId ?? ""} /> : activeModule === "Aulas e reservas" ? <ClassesModule onFeedback={feedback} /> : activeModule === "Avaliações" ? <AssessmentsModule onFeedback={feedback} initialStudentId={focusStudentId ?? ""} /> : <WorkspaceModule title={activeModule} profile={profile} onFeedback={feedback} />}
        <AcademyFooter />
      </div>
      <WorkspaceMobileNav profile={profile} activeModule={activeModule} onNavigate={navigateToModule} onMore={() => setMobileMenuOpen(true)} />
      {mobileMenuOpen && <WorkspaceMobileDrawer profile={profile} visibleNav={visibleNav} activeModule={activeModule} onNavigate={navigateToModule} onClose={() => setMobileMenuOpen(false)} operatorName={operatorName} operatorInitials={operatorInitials} onSettings={() => { setMobileMenuOpen(false); if (profile === "Gestão") setPermissionsOpen(true); else setAppearanceOpen(true); }} />}
      {appearanceOpen && theme && onThemeChange && <AppearancePanel theme={theme} onThemeChange={onThemeChange} onClose={() => setAppearanceOpen(false)} />}
      {permissionsOpen && theme && onThemeChange && <PermissionsPanel theme={theme} onThemeChange={onThemeChange} onClose={() => setPermissionsOpen(false)} onFeedback={feedback} />}
      {profileOpen && <ManagerProfilePanel profile={registeredProfile} onClose={() => setProfileOpen(false)} onFeedback={feedback} />}
    </section>
  );
}

async function compressProfilePhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("invalid-image");
  if (file.size > 6 * 1024 * 1024) throw new Error("image-too-large");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = source;
  });
  const size = 360;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas-unavailable");
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL("image/jpeg", .78);
}

function StudentProfilePhoto({ profile }: { profile: AccountProfile | null }) {
  const access = useAccess();
  const feedback = useFeedback();
  const [preview, setPreview] = useState(profile?.photoUrl || access.user.photoURL || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setPreview(profile?.photoUrl || access.user.photoURL || ""), [access.user.photoURL, profile?.photoUrl]);
  async function selectPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaving(true);
    try {
      const photoUrl = await compressProfilePhoto(file);
      if (db) await setDoc(doc(db, "users", access.userId), { photoUrl }, { merge: true });
      else {
        window.localStorage.setItem(profileStorageKey(access.userId), JSON.stringify({ ...(profile ?? {}), photoUrl }));
        window.dispatchEvent(new Event("orquestra-fit:profile-updated"));
      }
      if (auth?.currentUser) await updateProfile(auth.currentUser, { photoURL: photoUrl });
      setPreview(photoUrl);
      feedback("Foto do perfil atualizada.");
    } catch (error) {
      feedback((error as Error).message === "image-too-large" ? "Escolha uma imagem com até 6 MB." : "Não foi possível salvar essa imagem.");
    } finally {
      setSaving(false);
    }
  }
  const initials = firstName(profile?.name || profile?.displayName || access.user.displayName, access.user.email).slice(0, 2).toUpperCase();
  return <div className="student-profile-photo"><span>{preview ? <img src={preview} alt="Foto do aluno" /> : initials}</span><label className={saving ? "saving" : ""}><Camera /><em>{saving ? "Salvando..." : "Alterar foto"}</em><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} disabled={saving} /></label></div>;
}

function WorkspaceMobileNav({ profile, activeModule, onNavigate, onMore }: { profile: "Gestão" | "Professor"; activeModule: string; onNavigate: (module: string) => void; onMore: () => void }) {
  const items = profile === "Professor"
    ? [["Visão geral", LayoutDashboard], ["Alunos", Users], ["Treinos", Dumbbell], ["Aulas e reservas", CalendarDays]] as const
    : [["Visão geral", LayoutDashboard], ["Alunos", Users], ["Professores", UserRoundCheck], ["Planos e mensalidades", WalletCards]] as const;
  return <nav className="workspace-mobile-nav" aria-label="Acessos rápidos">{items.map(([label, Icon]) => <button key={label} className={activeModule === label ? "active" : ""} onClick={() => onNavigate(label)}><Icon /><span>{label === "Visão geral" ? "Início" : label === "Planos e mensalidades" ? "Planos" : label.split(" ")[0]}</span></button>)}<button onClick={onMore}><MoreHorizontal /><span>Mais</span></button></nav>;
}

function WorkspaceMobileDrawer({ profile, visibleNav, activeModule, onNavigate, onClose, operatorName, operatorInitials, onSettings }: { profile: "Gestão" | "Professor"; visibleNav: ReadonlyArray<readonly [string, React.ElementType]>; activeModule: string; onNavigate: (module: string) => void; onClose: () => void; operatorName: string; operatorInitials: string; onSettings: () => void }) {
  return (
    <div className="workspace-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="workspace-mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu principal" onClick={(event) => event.stopPropagation()}>
        <header><AcademyBrand /><button aria-label="Fechar menu" onClick={onClose}><X /></button></header>
        <div className="workspace-drawer-profile"><span>{operatorInitials}</span><div><strong>{operatorName}</strong><small>{profile}</small></div></div>
        <nav>{visibleNav.map(([label, Icon]) => <button key={label} className={activeModule === label ? "active" : ""} onClick={() => { onNavigate(label); onClose(); }}><Icon /><span>{label}</span><ChevronRight /></button>)}</nav>
        <button className="workspace-drawer-settings" onClick={onSettings}><Settings /><span>Configurações</span><ChevronRight /></button>
        <button className="workspace-drawer-logout" onClick={() => void logout()}><User /><span>Sair da conta</span></button>
        <div className="drawer-footer"><small>PLATAFORMA</small><strong>Orquestra Fit</strong></div>
      </aside>
    </div>
  );
}

function StudentPlanPanel() {
  const access = useAccess();
  const [student, setStudent] = useState<{ plan?: string; planStartedAt?: string; planEndsAt?: string } | null>(null);
  const [charges, setCharges] = useState<MonthlyCharge[]>([]);
  useEffect(() => {
    if (!db) {
      const syncLocalPlan = () => {
        const studentId = localStudentId(access.academyId, access.userId);
        const localStudent = readLocalCollection<{ id: string; plan?: string }>(access.academyId, "students").find((item) => item.id === studentId);
        setStudent(localStudent ?? null);
        setCharges(readLocalCollection<MonthlyCharge>(access.academyId, "monthlyCharges").filter((item) => item.studentId === studentId).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
      };
      syncLocalPlan();
      window.addEventListener("orquestra-fit:collection-updated", syncLocalPlan);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocalPlan);
    }
    const unsubscribeStudent = onSnapshot(doc(db, "academies", access.academyId, "students", access.userId), (snapshot) => setStudent(snapshot.exists() ? snapshot.data() as { plan?: string; planStartedAt?: string; planEndsAt?: string } : null));
    const unsubscribeCharges = onSnapshot(query(collection(db, "academies", access.academyId, "monthlyCharges"), where("studentId", "==", access.userId)), (snapshot) => {
      setCharges(snapshot.docs.map((item) => { const data = item.data() as Omit<MonthlyCharge, "id">; return { id: item.id, ...data, amount: Number(data.amount ?? 0), status: (data.status === "paid" ? "paid" : "pending") as MonthlyCharge["status"] }; }).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    });
    return () => { unsubscribeStudent(); unsubscribeCharges(); };
  }, [access.academyId, access.userId]);
  const nextCharge = charges.find((charge) => charge.status !== "paid") ?? charges[charges.length - 1];
  const paidTotal = charges.filter((charge) => charge.status === "paid").reduce((total, charge) => total + charge.amount, 0);
  const start = student?.planStartedAt ? formatDate(student.planStartedAt) : "Ainda não informado";
  const end = student?.planEndsAt ? formatDate(student.planEndsAt) : nextCharge ? formatDate(nextCharge.dueDate) : "Ainda não informado";
  return <div className="student-plan-detail"><strong>{student?.plan || nextCharge?.planName || "Plano ainda não definido"}</strong><div className="student-plan-grid"><div><small>Pago</small><b>R$ {paidTotal.toFixed(2).replace(".", ",")}</b></div><div><small>Dias restantes</small><b>{nextCharge ? Math.max(daysUntil(nextCharge.dueDate), 0) : "—"}</b></div><div><small>Início</small><b>{start}</b></div><div><small>Válido até</small><b>{end}</b></div></div><small>{nextCharge ? `Próximo vencimento: ${formatDate(nextCharge.dueDate)} · ${chargeStatusLabel(chargeViewStatus(nextCharge))}` : "A academia ainda não lançou cobranças para este aluno."}</small></div>;
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
type AttendanceRecord = { id: string; classId: string; className: string; studentId: string; studentName: string; date: string; time: string };
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

function maskCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  const split = digits.length === 11 ? 7 : 6;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}

function maskCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function capitalizeName(value: string) {
  return value.toLocaleLowerCase("pt-BR").replace(/(^|[\s'-])(\p{L})/gu, (_, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase("pt-BR")}`);
}

function maskCurrency(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseCurrency(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function AssessmentsModule({ onFeedback, initialStudentId = "" }: { onFeedback: (message: string) => void; initialStudentId?: string }) {
  const access = useAccess();
  const [students, setStudents] = useState<BillingStudent[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [studentId, setStudentId] = useState(initialStudentId);
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
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
    if (!db) {
      setStudents(readLocalCollection<BillingStudent>(access.academyId, "students"));
      setAssessments(readLocalCollection<AssessmentRecord>(access.academyId, "assessments").sort((a, b) => b.date.localeCompare(a.date)));
      return;
    }
    const unsubscribeStudents = onSnapshot(collection(db, "academies", access.academyId, "students"), (snapshot) => setStudents(snapshot.docs.map((student) => { const data = student.data() as { name?: string; active?: boolean }; return { id: student.id, name: data.name ?? "Aluno sem nome", active: data.active !== false }; })));
    const unsubscribeAssessments = onSnapshot(collection(db, "academies", access.academyId, "assessments"), (snapshot) => setAssessments(snapshot.docs.map((item) => { const data = item.data() as Omit<AssessmentRecord, "id">; return { id: item.id, ...data }; }).sort((a, b) => b.date.localeCompare(a.date))));
    return () => { unsubscribeStudents(); unsubscribeAssessments(); };
  }, [access.academyId]);

  async function createAssessment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentId || !date || !weight || !height) { onFeedback("Selecione o aluno e informe data, peso e altura."); return; }
    const student = students.find((item) => item.id === studentId);
    if (!student) { onFeedback("Aluno não encontrado."); return; }
    if (!db) {
      const nextAssessment: AssessmentRecord = { id: `local-assessment-${Date.now()}`, studentId, studentName: student.name, date, weight, height, bodyFat, biceps, waist, chest, thigh, notes };
      const nextAssessments = [nextAssessment, ...assessments].sort((a, b) => b.date.localeCompare(a.date));
      setAssessments(nextAssessments);
      writeLocalCollection(access.academyId, "assessments", nextAssessments);
      setStudentId(""); setDate(""); setWeight(""); setHeight(""); setBodyFat(""); setBiceps(""); setWaist(""); setChest(""); setThigh(""); setNotes("");
      onFeedback("Avaliação física registrada no modo local.");
      return;
    }
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
      <section className="assessment-layout"><article className="workspace-panel plan-form-panel"><header><div><span>NOVA AVALIAÇÃO</span><h3>Registrar medidas</h3></div></header><form className="student-detail-form" onSubmit={createAssessment}><label>Aluno<select value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="">Selecione um aluno</option>{students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><div className="measurement-grid"><label>Peso (kg)<input value={weight} onChange={(event) => setWeight(event.target.value)} inputMode="decimal" placeholder="72,5" required /></label><label>Altura (cm)<input value={height} onChange={(event) => setHeight(event.target.value)} inputMode="numeric" placeholder="175" required /></label><label>Gordura (%)<input value={bodyFat} onChange={(event) => setBodyFat(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label><label>Bíceps (cm)<input value={biceps} onChange={(event) => setBiceps(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label><label>Cintura (cm)<input value={waist} onChange={(event) => setWaist(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label><label>Peito (cm)<input value={chest} onChange={(event) => setChest(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label><label>Coxa (cm)<input value={thigh} onChange={(event) => setThigh(event.target.value)} inputMode="decimal" placeholder="Opcional" /></label></div><AssessmentAnatomyReference /><label>Observações<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observações do professor" /></label><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar avaliação"}</button></form></article><article className="workspace-panel plans-list-panel"><header><div><span>HISTÓRICO</span><h3>{assessments.length} {assessments.length === 1 ? "avaliação" : "avaliações"}</h3></div></header><label className="assessment-filter">Ver evolução de<select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}><option value="">Selecione um aluno</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><div className="assessment-list">{assessments.length === 0 ? <div className="directory-empty"><Activity /><p>Nenhuma avaliação registrada ainda.</p></div> : assessments.map((item) => <button className="assessment-row assessment-row-button" key={item.id} onClick={() => setSelectedStudentId(item.studentId)}><div><strong>{item.studentName}</strong><small>{item.date} · {item.weight} kg · {item.height} cm{item.biceps ? ` · Bíceps ${item.biceps} cm` : ""}</small></div><span>{item.bodyFat ? `${item.bodyFat}% gordura` : "Medidas básicas"}</span></button>)}</div>{selectedLatest && <div className="staff-assessment-detail"><span>COMPARAÇÃO DO ALUNO</span><strong>{selectedLatest.studentName}</strong><small>{selectedPrevious ? `${formatDate(selectedPrevious.date)} → ${formatDate(selectedLatest.date)}` : "Primeira avaliação registrada"}</small><div className="staff-measure-grid">{([ ["Peso", "weight", "kg"], ["Gordura", "bodyFat", "%"], ["Bíceps", "biceps", "cm"], ["Cintura", "waist", "cm"] ] as const).map(([label, key, unit]) => { const value = selectedLatest[key] ? `${selectedLatest[key]} ${unit}` : "Não informado"; const delta = selectedDelta(key); return <div key={key}><small>{label}</small><strong>{value}</strong><span>{delta === null ? "Sem comparação" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${unit}`}</span></div>; })}</div></div>}</article></section>
    </div>
  );
}

function ClassesModule({ onFeedback }: { onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [reservationCounts, setReservationCounts] = useState<Record<string, number>>({});
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [instructor, setInstructor] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) {
      setClasses(readLocalCollection<ClassRecord>(access.academyId, "classes"));
      return;
    }
    return onSnapshot(collection(db, "academies", access.academyId, "classes"), (snapshot) => {
      setClasses(snapshot.docs.map((item) => {
        const data = item.data() as Partial<ClassRecord>;
        return { id: item.id, name: data.name ?? "Aula", instructor: data.instructor ?? "Equipe", date: data.date ?? "", time: data.time ?? "", capacity: Number(data.capacity ?? 10), active: data.active !== false };
      }).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)));
    }, (error) => console.error("Não foi possível carregar as aulas.", error));
  }, [access.academyId]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, "academies", access.academyId, "attendance"), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((item) => {
        const classId = String(item.data().classId ?? "");
        if (classId) counts[classId] = (counts[classId] ?? 0) + 1;
      });
      setAttendanceCounts(counts);
    }, (error) => console.error("Não foi possível carregar as presenças.", error));
  }, [access.academyId]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, "academies", access.academyId, "reservations"), where("status", "==", "active")), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((item) => {
        const classId = String(item.data().classId ?? "");
        if (classId) counts[classId] = (counts[classId] ?? 0) + 1;
      });
      setReservationCounts(counts);
    }, (error) => console.error("Não foi possível carregar as reservas.", error));
  }, [access.academyId]);

  async function createClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !date || !time) { onFeedback("Informe o nome, a data e o horário da aula."); return; }
    if (!db) {
      const localClass: ClassRecord = { id: editingClassId ?? `local-class-${Date.now()}`, name: capitalizeName(name.trim()), instructor: capitalizeName(instructor.trim() || "Equipe da academia"), date, time, capacity: Number(capacity) || 10, active: true };
      const nextClasses = (editingClassId ? classes.map((item) => item.id === editingClassId ? localClass : item) : [...classes, localClass]).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
      setClasses(nextClasses);
      writeLocalCollection(access.academyId, "classes", nextClasses);
      clearForm();
      onFeedback(editingClassId ? "Aula atualizada no modo local." : "Aula criada no modo local.");
      return;
    }
    setSaving(true);
    try {
      const data = { name: name.trim(), instructor: instructor.trim() || "Equipe da academia", date, time, capacity: Number(capacity) || 10, updatedBy: access.userId, updatedAt: serverTimestamp() };
      if (editingClassId) {
        await updateDoc(doc(db, "academies", access.academyId, "classes", editingClassId), data);
        onFeedback("Aula atualizada na agenda.");
      } else {
        await addDoc(collection(db, "academies", access.academyId, "classes"), { ...data, active: true, createdBy: access.userId, createdAt: serverTimestamp() });
        onFeedback("Aula criada na agenda.");
      }
      clearForm();
    } catch { onFeedback("Não foi possível criar a aula."); }
    finally { setSaving(false); }
  }

  function editClass(item: ClassRecord) {
    setEditingClassId(item.id); setName(item.name); setInstructor(item.instructor); setDate(item.date); setTime(item.time); setCapacity(String(item.capacity));
  }

  function clearForm() {
    setEditingClassId(null); setName(""); setInstructor(""); setDate(""); setTime(""); setCapacity("10");
  }

  async function removeClass(item: ClassRecord) {
    if (access.role !== "admin") return;
    if (!window.confirm(`Excluir a aula "${item.name}"?`)) return;
    if (!db) {
      const nextClasses = classes.filter((current) => current.id !== item.id);
      setClasses(nextClasses);
      writeLocalCollection(access.academyId, "classes", nextClasses);
      if (editingClassId === item.id) clearForm();
      onFeedback("Aula excluída no modo local.");
      return;
    }
    try { await deleteDoc(doc(db, "academies", access.academyId, "classes", item.id)); onFeedback("Aula excluída."); if (editingClassId === item.id) clearForm(); }
    catch { onFeedback("Não foi possível excluir a aula."); }
  }

  async function toggleClass(item: ClassRecord) {
    if (!db) {
      const nextClasses = classes.map((current) => current.id === item.id ? { ...current, active: !current.active } : current);
      setClasses(nextClasses);
      writeLocalCollection(access.academyId, "classes", nextClasses);
      onFeedback(item.active ? "Aula desativada no modo local." : "Aula reativada no modo local.");
      return;
    }
    try { await updateDoc(doc(db, "academies", access.academyId, "classes", item.id), { active: !item.active }); onFeedback(item.active ? "Aula desativada." : "Aula reativada."); }
    catch { onFeedback("Não foi possível alterar a aula."); }
  }

  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro"><div><span>AGENDA · {access.role === "teacher" ? "PROFESSOR" : "GESTÃO"}</span><h2>Aulas e reservas</h2><p>Organize horários, vagas e reservas dos alunos.</p></div></section>
      <section className="classes-layout"><article className="workspace-panel plan-form-panel"><header><div><span>{editingClassId ? "EDITAR AULA" : "NOVA AULA"}</span><h3>{editingClassId ? "Atualizar turma" : "Criar turma"}</h3></div></header><form className="student-detail-form" onSubmit={createClass}><label>Nome da aula<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Funcional" required /></label><label>Professor<input value={instructor} onChange={(event) => setInstructor(event.target.value)} placeholder="Nome do professor" /></label><label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Horário<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label><label>Vagas<input type="number" min="1" max="200" value={capacity} onChange={(event) => setCapacity(event.target.value)} required /></label><div className="form-actions"><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : editingClassId ? "Salvar alterações" : "Criar aula"}</button>{editingClassId && <button className="secondary-action" type="button" onClick={clearForm}>Cancelar</button>}</div></form></article><article className="workspace-panel plans-list-panel"><header><div><span>AGENDA DA ACADEMIA</span><h3>{classes.length} {classes.length === 1 ? "aula" : "aulas"}</h3></div></header><div className="plans-list">{classes.length === 0 ? <div className="directory-empty"><CalendarDays /><p>Nenhuma aula cadastrada ainda.</p></div> : classes.map((item) => { const reserved = reservationCounts[item.id] ?? 0; const present = attendanceCounts[item.id] ?? 0; return <div className="plan-row" key={item.id}><div><strong>{item.name}</strong><small>{item.date} às {item.time} · {item.instructor}</small><small>{reserved} {reserved === 1 ? "reserva" : "reservas"} de {item.capacity} vagas · {present} {present === 1 ? "presença" : "presenças"}</small></div><div className="row-actions"><button type="button" className={item.active ? "plan-enable" : "plan-disable"} onClick={() => toggleClass(item)}>{item.active ? "Ativa" : "Inativa"}</button><button type="button" className="plan-edit" onClick={() => editClass(item)}>Editar</button>{access.role === "admin" && <button type="button" className="plan-delete" onClick={() => removeClass(item)}>Excluir</button>}</div></div>; })}</div></article></section>
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
  return <BodyRegionIcon region={region} />;
}

function AssessmentAnatomyReference() {
  return <section className="assessment-anatomy-reference" aria-label="Referência anatômica para medidas">
    <header><div><span>REFERÊNCIA ANATÔMICA</span><strong>Pontos de medição</strong></div><small>Use sempre os mesmos pontos</small></header>
    <div className="assessment-anatomy-bodies"><figure><img src="/anatomy-body-base.png" alt="Corpo anatômico visto de frente" /><figcaption>Frente</figcaption></figure><figure><img src="/anatomy-body-back.png" alt="Corpo anatômico visto de costas" /><figcaption>Costas</figcaption></figure></div>
    <p>Peito na linha dos mamilos · cintura na menor circunferência · bíceps no centro do braço · coxa no ponto médio.</p>
  </section>;
}

function BodyRegionIcon({ region }: { region: BodyRegion }) {
  const active = (part: BodyRegion) => region === part ? "body-region-active" : "body-region-muted";
  return <svg className="body-region-icon" viewBox="0 0 28 32" aria-hidden="true">
    <circle className="body-region-outline" cx="14" cy="4" r="2.6" />
    <path className={active("Tronco anterior")} d="M10.4 8.1c1.1-.8 6.1-.8 7.2 0l1.2 8.7H9.2z" />
    {region === "Tronco posterior" && <path className="body-region-active" d="M10.4 8.1h7.2l1.2 8.7H9.2zm3.6.5v7.6" />}
    <path className={active("Membros superiores")} d="M9.8 8.7 6.9 11 4.6 20l2 .6 3.2-8.1m8.4-3.8 2.9 2.3 2.3 9-2 .6-3.2-8.1" />
    <path className={active("Região central")} d="M10 14.5h8l-.4 4.4-3.6 1.4-3.6-1.4z" />
    <path className={active("Membros inferiores")} d="m10.5 19 3.5 1.2 3.5-1.2 2 10.2-2.4.4-3.1-7-3.1 7-2.4-.4z" />
  </svg>;
}

function ExercisePicker({ exercises, selectedExercises, exerciseDetails, onToggle, onParameterChange }: { exercises: ExerciseRecord[]; selectedExercises: string[]; exerciseDetails: Record<string, Omit<WorkoutExerciseDetail, "exerciseId" | "name">>; onToggle: (exercise: ExerciseRecord) => void; onParameterChange: (exerciseId: string, field: "sets" | "reps" | "load" | "rest", value: string) => void }) {
  const [openPhases, setOpenPhases] = useState<ExercisePhase[]>([]);
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
  const [openRegions, setOpenRegions] = useState<BodyRegion[]>([]);
  function toggleRegion(region: BodyRegion) { setOpenRegions((current) => current.includes(region) ? current.filter((item) => item !== region) : [...current, region]); }
  return <div className="exercise-library">{exerciseRegionOrder.map((region) => { const regionExercises = exercises.filter((exercise) => (exercise.bodyRegion ?? "Membros superiores") === region); if (!regionExercises.length) return null; const isOpen = openRegions.includes(region); return <section className={isOpen ? "library-region-group open" : "library-region-group"} key={region}><button className="collapse-header" type="button" onClick={() => toggleRegion(region)}><span><ChevronDown className={isOpen ? "rotated" : ""} />{exerciseRegionIcon(region)}{region}</span><small>{regionExercises.length} exercícios</small></button>{isOpen && <div className="collapse-content">{Array.from(new Set(regionExercises.map((exercise) => exercise.muscleGroup))).map((muscleGroup) => <div className="library-class-group" key={`${region}-${muscleGroup}`}><h4>{muscleGroup}</h4>{regionExercises.filter((exercise) => exercise.muscleGroup === muscleGroup).map((exercise) => <div className="library-exercise-row" key={exercise.id}><div><strong>{exercise.name}</strong><small>{exercise.phase ?? "Treino principal"} · {exercise.exerciseType ?? "Força"}{exercise.secondaryMuscles ? ` · auxiliares: ${exercise.secondaryMuscles}` : ""}</small></div><div className="exercise-actions"><button type="button" onClick={() => onEdit(exercise)}>Editar</button>{accessRole === "admin" && <button type="button" onClick={() => onRemove(exercise)}>Excluir</button>}</div></div>)}</div>)}</div>}</section>; })}</div>;
}

function PublishedWorkouts({ templates, workouts, onEditTemplate, onRemoveTemplate, onEditWorkout, onRemoveWorkout }: { templates: WorkoutTemplateRecord[]; workouts: WorkoutRecord[]; onEditTemplate: (template: WorkoutTemplateRecord) => void; onRemoveTemplate: (template: WorkoutTemplateRecord) => void; onEditWorkout: (workout: WorkoutRecord) => void; onRemoveWorkout: (workout: WorkoutRecord) => void }) {
  const empty = templates.length === 0 && workouts.length === 0;
  return <section className="workspace-panel published-workouts"><header><div><span>MODELOS E TREINOS PUBLICADOS</span><h3>{templates.length} modelos · {workouts.length} publicados</h3></div></header>{empty ? <div className="directory-empty"><Dumbbell /><p>Salve uma ficha para reutilizar depois.</p></div> : <div className="published-list">{templates.map((template) => <div key={template.id}><div><strong>{template.name}</strong><small>Modelo reutilizável · {template.exerciseIds.length} exercícios</small></div><div className="published-item-actions"><em>Modelo</em><button type="button" onClick={() => onEditTemplate(template)}>Editar</button><button type="button" onClick={() => onRemoveTemplate(template)}>Excluir</button></div></div>)}{workouts.map((workout) => <div key={workout.id}><div><strong>{workout.name}</strong><small>{workout.studentName} · {workout.exerciseIds.length} exercícios</small></div><div className="published-item-actions"><em>Publicado</em><button type="button" onClick={() => printWorkoutSheet(workout)}><Printer size={13} /> Imprimir</button><button type="button" onClick={() => onEditWorkout(workout)}>Editar</button><button type="button" onClick={() => onRemoveWorkout(workout)}>Excluir</button></div></div>)}</div>}</section>;
}

function TrainingModule({ onFeedback, initialStudentId = "" }: { onFeedback: (message: string) => void; initialStudentId?: string }) {
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
  const [studentId, setStudentId] = useState(initialStudentId);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [exerciseDetails, setExerciseDetails] = useState<Record<string, Omit<WorkoutExerciseDetail, "exerciseId" | "name">>>({});
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) {
      setStudents(readLocalCollection<BillingStudent>(access.academyId, "students"));
      setExercises(readLocalCollection<ExerciseRecord>(access.academyId, "exercises"));
      setWorkouts(readLocalCollection<WorkoutRecord>(access.academyId, "workouts"));
      setTemplates(readLocalCollection<WorkoutTemplateRecord>(access.academyId, "workoutTemplates"));
      return;
    }
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
    if (!exerciseName.trim() || !muscleGroup.trim()) {
      onFeedback("Informe o nome e o grupo muscular do exercício.");
      return;
    }
    if (!db) {
      const fallback = starterClassification(exerciseName.trim(), muscleGroup.trim());
      const localExercise: ExerciseRecord = {
        id: editingExerciseId ?? `local-exercise-${Date.now()}`,
        name: capitalizeName(exerciseName.trim()),
        muscleGroup: capitalizeName(muscleGroup.trim()),
        ...fallback,
        secondaryMuscles: secondaryMuscles.trim(),
        anatomyRegion: anatomyRegion.trim(),
        instructions: instructions.trim(),
        videoUrl: videoUrl.trim(),
        bodyRegion,
        phase,
        exerciseType,
      };
      const nextExercises = editingExerciseId ? exercises.map((item) => item.id === editingExerciseId ? localExercise : item) : [...exercises, localExercise];
      setExercises(nextExercises);
      writeLocalCollection(access.academyId, "exercises", nextExercises);
      clearExerciseForm();
      onFeedback(editingExerciseId ? "Exercício atualizado no modo local." : "Exercício cadastrado no modo local.");
      return;
    }
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
    if (access.role !== "admin" || !window.confirm(`Excluir o exercício \"${exercise.name}\"? Treinos já publicados não serão alterados.`)) return;
    if (!db) {
      const nextExercises = exercises.filter((item) => item.id !== exercise.id);
      setExercises(nextExercises);
      writeLocalCollection(access.academyId, "exercises", nextExercises);
      if (editingExerciseId === exercise.id) clearExerciseForm();
      onFeedback("Exercício excluído no modo local.");
      return;
    }
    try {
      await deleteDoc(doc(db, "academies", access.academyId, "exercises", exercise.id));
      if (editingExerciseId === exercise.id) clearExerciseForm();
      onFeedback("Exercício excluído da biblioteca.");
    } catch { onFeedback("Não foi possível excluir o exercício."); }
  }

  async function seedStarterExercises() {
    if (!db) {
      const seeded = starterExercises.map(([name, muscleGroup, secondaryMuscles, anatomyRegion], index) => ({ id: `local-starter-${index}`, name, muscleGroup, secondaryMuscles, anatomyRegion, instructions: "Orientação objetiva será adicionada pelo professor.", videoUrl: "", ...starterClassification(name, muscleGroup) }));
      const nextExercises = exercises.length ? exercises : seeded;
      setExercises(nextExercises);
      writeLocalCollection(access.academyId, "exercises", nextExercises);
      onFeedback(exercises.length ? "A biblioteca inicial já foi carregada." : `${seeded.length} exercícios adicionados no modo local.`);
      return;
    }
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
    if (!workoutName.trim() || !studentId || selectedExercises.length === 0) {
      onFeedback("Informe o nome, selecione o aluno e escolha os exercícios.");
      return;
    }
    const preparationCount = selectedExercises.filter((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId)?.phase === "Preparação").length;
    if (preparationCount < 1 || preparationCount > 3) { onFeedback("Inclua de 1 a 3 exercícios de preparação antes de publicar o treino."); return; }
    const student = students.find((item) => item.id === studentId);
    if (!student) { onFeedback("Aluno não encontrado."); return; }
    const details = selectedExercises.map((exerciseId) => {
      const exercise = exercises.find((item) => item.id === exerciseId);
      return { exerciseId, name: exercise?.name ?? "Exercício", muscleGroup: exercise?.muscleGroup, secondaryMuscles: exercise?.secondaryMuscles, anatomyRegion: exercise?.anatomyRegion, instructions: exercise?.instructions, videoUrl: exercise?.videoUrl, bodyRegion: exercise?.bodyRegion, phase: exercise?.phase, exerciseType: exercise?.exerciseType, ...exerciseDetails[exerciseId] };
    });
    if (!db) {
      const localWorkout: WorkoutRecord = { id: editingWorkoutId ?? `local-workout-${Date.now()}`, name: capitalizeName(workoutName.trim()), studentId, studentName: student.name, exerciseIds: selectedExercises, exerciseDetails: details as WorkoutExerciseDetail[], status: "published" };
      const nextWorkouts = editingWorkoutId ? workouts.map((item) => item.id === editingWorkoutId ? localWorkout : item) : [...workouts, localWorkout];
      setWorkouts(nextWorkouts);
      writeLocalCollection(access.academyId, "workouts", nextWorkouts);
      setWorkoutName(""); setStudentId(""); setSelectedExercises([]); setExerciseDetails({}); setEditingWorkoutId(null);
      onFeedback(editingWorkoutId ? "Treino atualizado no modo local." : "Treino publicado no modo local.");
      return;
    }
    setSaving(true);
    try {
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
    if (!workoutName.trim() || selectedExercises.length === 0) {
      onFeedback("Informe o nome e selecione exercícios para salvar o modelo.");
      return;
    }
    const preparationCount = selectedExercises.filter((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId)?.phase === "Preparação").length;
    if (preparationCount < 1 || preparationCount > 3) { onFeedback("Inclua de 1 a 3 exercícios de preparação no modelo."); return; }
    const details = selectedExercises.map((exerciseId) => {
      const exercise = exercises.find((item) => item.id === exerciseId);
      return { exerciseId, name: exercise?.name ?? "Exercício", muscleGroup: exercise?.muscleGroup, secondaryMuscles: exercise?.secondaryMuscles, anatomyRegion: exercise?.anatomyRegion, instructions: exercise?.instructions, videoUrl: exercise?.videoUrl, bodyRegion: exercise?.bodyRegion, phase: exercise?.phase, exerciseType: exercise?.exerciseType, ...exerciseDetails[exerciseId] };
    });
    if (!db) {
      const localTemplate: WorkoutTemplateRecord = { id: editingTemplateId ?? `local-template-${Date.now()}`, name: capitalizeName(workoutName.trim()), exerciseIds: selectedExercises, exerciseDetails: details as WorkoutExerciseDetail[], createdBy: access.userId };
      const nextTemplates = editingTemplateId ? templates.map((item) => item.id === editingTemplateId ? localTemplate : item) : [...templates, localTemplate];
      setTemplates(nextTemplates);
      writeLocalCollection(access.academyId, "workoutTemplates", nextTemplates);
      setEditingTemplateId(null);
      onFeedback(editingTemplateId ? "Modelo de treino atualizado no modo local." : "Modelo de treino salvo no modo local.");
      return;
    }
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
    if (!window.confirm(`Excluir o modelo "${template.name}"?`)) return;
    if (!db) {
      const nextTemplates = templates.filter((item) => item.id !== template.id);
      setTemplates(nextTemplates);
      writeLocalCollection(access.academyId, "workoutTemplates", nextTemplates);
      if (editingTemplateId === template.id) setEditingTemplateId(null);
      onFeedback("Modelo excluído no modo local.");
      return;
    }
    try { await deleteDoc(doc(db, "academies", access.academyId, "workoutTemplates", template.id)); if (editingTemplateId === template.id) setEditingTemplateId(null); onFeedback("Modelo excluído."); }
    catch { onFeedback("Não foi possível excluir o modelo."); }
  }

  async function removeWorkout(workout: WorkoutRecord) {
    if (!window.confirm(`Excluir o treino "${workout.name}" de ${workout.studentName}?`)) return;
    if (!db) {
      const nextWorkouts = workouts.filter((item) => item.id !== workout.id);
      setWorkouts(nextWorkouts);
      writeLocalCollection(access.academyId, "workouts", nextWorkouts);
      if (editingWorkoutId === workout.id) setEditingWorkoutId(null);
      onFeedback("Treino excluído no modo local.");
      return;
    }
    try { await deleteDoc(doc(db, "academies", access.academyId, "workouts", workout.id)); if (editingWorkoutId === workout.id) setEditingWorkoutId(null); onFeedback("Treino excluído."); }
    catch { onFeedback("Não foi possível excluir o treino."); }
  }

  return <div className="workspace-content module-view">
    <section className="workspace-intro"><div><span>PRESCRIÇÃO · {access.role === "teacher" ? "PROFESSOR" : "GESTÃO"}</span><h2>Treinos</h2><p>Monte uma ficha por etapas, salve modelos e publique para um aluno quando estiver pronta.</p></div></section>
    <section className="training-layout training-layout-redesigned">
      <article className="workspace-panel training-form-panel"><header><div><span>1 · MONTAGEM DA FICHA</span><h3>Escolher exercícios</h3><p className="panel-helper">Comece pela preparação, avance para o treino principal e finalize com cardio ou alongamento.</p></div></header><form className="student-detail-form" onSubmit={createWorkout}><label>Modelo existente<select defaultValue="" onChange={(event) => loadTemplate(event.target.value)}><option value="">Criar ficha do zero</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Nome da ficha<input value={workoutName} onChange={(event) => setWorkoutName(event.target.value)} placeholder="Ex.: Peito e bíceps · A" required /></label><label>Aluno específico <span className="optional-label">opcional para salvar como modelo</span><select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Nenhum aluno · salvar modelo</option>{students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><ExercisePicker exercises={exercises} selectedExercises={selectedExercises} exerciseDetails={exerciseDetails} onToggle={toggleExercise} onParameterChange={updateExerciseParameter} /><ExerciseLibrary exercises={exercises} accessRole={access.role} onEdit={editExercise} onRemove={(exercise) => void removeExercise(exercise)} /><div className="training-actions training-actions-final"><button className="detail-secondary" type="button" onClick={saveTemplate} disabled={!workoutName.trim() || selectedExercises.length === 0}>Salvar modelo</button><button className="detail-save" type="submit" disabled={saving || !studentId || selectedExercises.length === 0}>{saving ? "Publicando..." : "Publicar para aluno"}</button></div></form></article>
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

function BillingModule({ onFeedback, initialStudentId = "" }: { onFeedback: (message: string) => void; initialStudentId?: string }) {
  const access = useAccess();
  const [students, setStudents] = useState<BillingStudent[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [charges, setCharges] = useState<MonthlyCharge[]>([]);
  const [studentId, setStudentId] = useState(initialStudentId);
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
    if (!db) {
      setStudents(readLocalCollection<BillingStudent>(access.academyId, "students"));
      setPlans(readLocalCollection<AcademyPlan>(access.academyId, "plans"));
      setCharges(readLocalCollection<MonthlyCharge>(access.academyId, "monthlyCharges"));
      return;
    }
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
    if (!studentId || !dueDate) { onFeedback("Selecione o aluno e o vencimento da cobrança."); return; }
    const student = students.find((item) => item.id === studentId);
    const plan = plans.find((item) => item.id === planId);
    const amount = chargeType === "monthly" ? plan?.price ?? 0 : parseCurrency(chargeAmount);
    if (!student || (chargeType === "monthly" && !plan) || !amount) { onFeedback("Preencha os dados da cobrança antes de continuar."); return; }
    if (!db) {
      const nextCharge: MonthlyCharge = { id: `local-charge-${Date.now()}`, studentId, studentName: student.name, planName: chargeType === "monthly" ? plan?.name ?? "Mensalidade" : capitalizeName(chargeDescription.trim() || (chargeType === "registration" ? "Taxa de inscrição" : "Serviço avulso")), chargeType, amount, dueDate, status: "pending" };
      const nextCharges = [...charges, nextCharge].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      setCharges(nextCharges);
      writeLocalCollection(access.academyId, "monthlyCharges", nextCharges);
      setStudentId(""); setPlanId(""); setDueDate(""); setChargeDescription(""); setChargeAmount("");
      onFeedback("Cobrança criada no modo local.");
      return;
    }
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
    if (!planName.trim() || !planPrice) { onFeedback("Informe o nome e o valor do plano."); return; }
    if (!db) {
      const nextPlan: AcademyPlan = { id: `local-plan-${Date.now()}`, name: capitalizeName(planName.trim()), price: parseCurrency(planPrice), interval: planInterval, active: true };
      const nextPlans = [...plans, nextPlan];
      setPlans(nextPlans);
      writeLocalCollection(access.academyId, "plans", nextPlans);
      setPlanName(""); setPlanPrice(""); setPlanInterval("Mensal");
      onFeedback("Plano cadastrado no modo local.");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "academies", access.academyId, "plans"), { name: planName.trim(), price: parseCurrency(planPrice), interval: planInterval, active: true, createdBy: access.userId, createdAt: serverTimestamp() });
      setPlanName(""); setPlanPrice(""); setPlanInterval("Mensal");
      onFeedback("Plano cadastrado com sucesso.");
    } catch { onFeedback("Não foi possível cadastrar o plano."); }
    finally { setSaving(false); }
  }

  async function confirmPayment() {
    if (!paymentCharge) return;
    if (!db) {
      const nextCharges = charges.map((charge) => charge.id === paymentCharge.id ? { ...charge, status: "paid" as const, paymentMethod } : charge);
      setCharges(nextCharges);
      writeLocalCollection(access.academyId, "monthlyCharges", nextCharges);
      setPaymentCharge(null);
      onFeedback("Pagamento registrado no modo local.");
      return;
    }
    setSavingPayment(true);
    try {
      await updateDoc(doc(db, "academies", access.academyId, "monthlyCharges", paymentCharge.id), { status: "paid", paymentMethod, paidAt: serverTimestamp(), paidBy: access.userId });
      setPaymentCharge(null);
      onFeedback("Pagamento registrado e mensalidade baixada.");
    } catch { onFeedback("Não foi possível registrar o pagamento."); }
    finally { setSavingPayment(false); }
  }

  async function toggleCharge(charge: MonthlyCharge) {
    if (!db) {
      const nextCharges = charges.map((item) => item.id === charge.id ? { ...item, status: "pending" as const } : item);
      setCharges(nextCharges);
      writeLocalCollection(access.academyId, "monthlyCharges", nextCharges);
      onFeedback("Cobrança reaberta no modo local.");
      return;
    }
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
        <div className="billing-form-stack"><article className="workspace-panel plan-form-panel"><header><div><span>NOVO PLANO</span><h3>Cadastrar plano</h3></div></header><form className="student-detail-form" onSubmit={createPlan}><label>Nome do plano<input value={planName} onChange={(event) => setPlanName(capitalizeName(event.target.value))} placeholder="Ex.: Plano mensal" required /></label><label>Valor<input value={planPrice} onChange={(event) => setPlanPrice(maskCurrency(event.target.value))} inputMode="decimal" placeholder="R$ 0,00" required /></label><label>Periodicidade<select value={planInterval} onChange={(event) => setPlanInterval(event.target.value)}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></label><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Cadastrar plano"}</button></form></article><article className="workspace-panel plan-form-panel"><header><div><span>NOVA COBRANÇA</span><h3>Gerar cobrança</h3></div></header><form className="student-detail-form" onSubmit={createCharge}><label>Tipo<select value={chargeType} onChange={(event) => setChargeType(event.target.value as ChargeType)}><option value="monthly">Mensalidade</option><option value="registration">Taxa de inscrição</option><option value="service">Serviço avulso</option></select></label><label>Aluno<select value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="">Selecione um aluno</option>{students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>{chargeType === "monthly" ? <label>Plano<select value={planId} onChange={(event) => setPlanId(event.target.value)} required><option value="">Selecione um plano</option>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · R$ {plan.price.toFixed(2).replace(".", ",")}</option>)}</select></label> : <><label>Descrição<input value={chargeDescription} onChange={(event) => setChargeDescription(capitalizeName(event.target.value))} placeholder={chargeType === "registration" ? "Taxa de inscrição" : "Ex.: Avaliação física"} /></label><label>Valor<input value={chargeAmount} onChange={(event) => setChargeAmount(maskCurrency(event.target.value))} inputMode="decimal" placeholder="R$ 0,00" required /></label></>}<label>Vencimento<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label><button className="detail-save" type="submit" disabled={saving || students.length === 0 || (chargeType === "monthly" && plans.length === 0)}>{saving ? "Gerando..." : "Gerar cobrança"}</button></form></article></div>
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
    if (!db) {
      setPlans(readLocalCollection<AcademyPlan>(access.academyId, "plans"));
      return;
    }
    return onSnapshot(collection(db, "academies", access.academyId, "plans"), (snapshot) => {
      setPlans(snapshot.docs.map((plan) => {
        const data = plan.data() as { name?: string; price?: number; interval?: string; active?: boolean };
        return { id: plan.id, name: data.name ?? "Plano sem nome", price: Number(data.price ?? 0), interval: data.interval ?? "Mensal", active: data.active !== false };
      }));
    }, (error) => console.error("Não foi possível carregar os planos.", error));
  }, [access.academyId]);

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !price) { onFeedback("Informe o nome e o valor do plano."); return; }
    if (!db) {
      const nextPlan: AcademyPlan = { id: `local-plan-${Date.now()}`, name: capitalizeName(name.trim()), price: parseCurrency(price), interval, active: true };
      const nextPlans = [...plans, nextPlan];
      setPlans(nextPlans);
      writeLocalCollection(access.academyId, "plans", nextPlans);
      setName(""); setPrice(""); setInterval("Mensal");
      onFeedback("Plano criado no modo local.");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "academies", access.academyId, "plans"), {
        name: name.trim(),
        price: parseCurrency(price),
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
    if (!db) {
      const nextPlans = plans.map((item) => item.id === plan.id ? { ...item, active: !item.active } : item);
      setPlans(nextPlans);
      writeLocalCollection(access.academyId, "plans", nextPlans);
      onFeedback(plan.active ? "Plano desativado no modo local." : "Plano reativado no modo local.");
      return;
    }
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
        <article className="workspace-panel plan-form-panel"><header><div><span>NOVO PLANO</span><h3>Criar plano</h3></div></header><form className="student-detail-form" onSubmit={createPlan}><label>Nome do plano<input value={name} onChange={(event) => setName(capitalizeName(event.target.value))} placeholder="Ex.: Plano mensal" required /></label><label>Valor mensal<input value={price} onChange={(event) => setPrice(maskCurrency(event.target.value))} inputMode="decimal" placeholder="R$ 0,00" required /></label><label>Periodicidade<select value={interval} onChange={(event) => setInterval(event.target.value)}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></label><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Criar plano"}</button></form></article>
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
    if (!db) {
      setTeachers(readLocalCollection<RegisteredTeacher>(access.academyId, "teachers"));
      return;
    }
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
    if (!selectedTeacher || !editName.trim()) {
      onFeedback("Informe o nome completo do professor.");
      return;
    }
    if (!db) {
      const nextTeachers = teachers.map((teacher) => teacher.id === selectedTeacher.id ? { ...teacher, name: capitalizeName(editName.trim()), email: editEmail.trim() || null } : teacher);
      setTeachers(nextTeachers);
      writeLocalCollection(access.academyId, "teachers", nextTeachers);
      onFeedback("Dados do professor atualizados no modo local.");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "academies", access.academyId, "teachers", selectedTeacher.id), { name: capitalizeName(editName.trim()), email: editEmail.trim() || null });
      onFeedback("Dados do professor atualizados.");
    } catch {
      onFeedback("Não foi possível atualizar este professor.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTeacher() {
    if (!selectedTeacher) return;
    if (!db) {
      const nextTeachers = teachers.map((teacher) => teacher.id === selectedTeacher.id ? { ...teacher, active: selectedTeacher.active === false } : teacher);
      setTeachers(nextTeachers);
      writeLocalCollection(access.academyId, "teachers", nextTeachers);
      onFeedback(selectedTeacher.active === false ? "Acesso do professor ativado no modo local." : "Acesso do professor suspenso no modo local.");
      return;
    }
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
          {selectedTeacher ? <><header><div><span>PERFIL DO PROFESSOR</span><h3>Editar cadastro</h3></div><span className={selectedTeacher.active === false ? "detail-status inactive" : "detail-status"}>{selectedTeacher.active === false ? "Suspenso" : "Ativo"}</span></header><form className="student-detail-form" onSubmit={saveTeacher}><label>Nome completo<input value={editName} onChange={(event) => setEditName(capitalizeName(event.target.value))} required /></label><label>E-mail Google<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></label><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button></form><button className="detail-toggle" onClick={toggleTeacher}>{selectedTeacher.active === false ? "Reativar acesso" : "Suspender acesso"}</button></> : <div className="directory-empty detail-empty"><UserRoundCheck /><h3>Selecione um professor</h3><p>Escolha um cadastro para visualizar e editar os dados.</p></div>}
        </aside>
      </section>
    </div>
  );
}

function StudentMessagesPanel({ messages, body, sending, onBodyChange, onSend }: { messages: InternalMessage[]; body: string; sending: boolean; onBodyChange: (value: string) => void; onSend: () => void }) {
  return <section className="student-profile-messages"><div className="student-profile-message-heading"><span><MessageCircle /> MENSAGEM INTERNA</span><small>{messages.length} enviada(s)</small></div>{messages.length > 0 && <div className="student-message-history">{messages.slice(0, 2).map((message) => <div key={message.id}><strong>{message.senderName}</strong><p>{message.body}</p></div>)}</div>}<div className="student-message-compose"><textarea value={body} onChange={(event) => onBodyChange(event.target.value)} placeholder="Escreva uma orientação ou lembrete para o aluno..." /><button type="button" onClick={onSend} disabled={sending || !body.trim()}>{sending ? "Enviando..." : "Enviar mensagem"}</button></div></section>;
}

function StudentsModule({ onNewStudent, onFeedback, onNavigate, initialSearch = "" }: { onNewStudent?: () => void; onFeedback: (message: string) => void; onNavigate: (module: string, studentId: string) => void; initialSearch?: string }) {
  const access = useAccess();
  const [students, setStudents] = useState<RegisteredStudent[]>([]);
  const [teachers, setTeachers] = useState<RegisteredTeacher[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editPlan, setEditPlan] = useState("Mensal");
  const [editTeacherId, setEditTeacherId] = useState("");
  const [editAnatomyProfile, setEditAnatomyProfile] = useState<"masculino" | "feminino">("masculino");
  const [studentWorkouts, setStudentWorkouts] = useState<WorkoutRecord[]>([]);
  const [studentAssessments, setStudentAssessments] = useState<AssessmentRecord[]>([]);
  const [studentCharges, setStudentCharges] = useState<MonthlyCharge[]>([]);
  const [studentExecutions, setStudentExecutions] = useState<WorkoutExecution[]>([]);
  const [studentMessages, setStudentMessages] = useState<InternalMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => setSearch(initialSearch), [initialSearch]);

  useEffect(() => {
    if (!db) {
      const localStudents = readLocalCollection<RegisteredStudent>(access.academyId, "students");
      setStudents(localStudents.map((student) => ({ ...student, active: student.active !== false, plan: student.plan ?? "Sem plano" })));
      if (access.role === "admin") {
        setTeachers(readLocalCollection<RegisteredTeacher>(access.academyId, "teachers"));
        setPlans(readLocalCollection<BillingPlan>(access.academyId, "plans"));
      }
      return;
    }
    const studentsRef = collection(db, "academies", access.academyId, "students");
    const studentsQuery = access.role === "teacher" ? query(studentsRef, where("teacherId", "==", access.userId)) : studentsRef;
    const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
      setStudents(snapshot.docs.map((student) => {
        const data = student.data() as { name?: string; email?: string | null; phone?: string | null; cpf?: string | null; plan?: string; teacherId?: string | null; anatomyProfile?: "masculino" | "feminino"; active?: boolean };
        return { id: student.id, name: data.name ?? "Aluno sem nome", email: data.email ?? null, phone: data.phone ?? null, cpf: data.cpf ?? null, plan: data.plan ?? "Sem plano", teacherId: data.teacherId ?? null, anatomyProfile: data.anatomyProfile === "feminino" ? "feminino" : "masculino", active: data.active !== false };
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
    setEditPhone(selectedStudent.phone ?? "");
    setEditCpf(selectedStudent.cpf ?? "");
    setEditPlan(selectedStudent.plan);
    setEditTeacherId(selectedStudent.teacherId ?? "");
    setEditAnatomyProfile(selectedStudent.anatomyProfile === "feminino" ? "feminino" : "masculino");
  }, [selectedStudent]);

  useEffect(() => {
    if (!db || !selectedId) {
      if (!selectedId) {
        setStudentWorkouts([]); setStudentAssessments([]); setStudentCharges([]); setStudentExecutions([]); setStudentMessages([]);
        return;
      }
      setStudentWorkouts(readLocalCollection<WorkoutRecord>(access.academyId, "workouts").filter((item) => item.studentId === selectedId && item.status === "published"));
      setStudentAssessments(readLocalCollection<AssessmentRecord>(access.academyId, "assessments").filter((item) => item.studentId === selectedId).sort((a, b) => b.date.localeCompare(a.date)));
      setStudentCharges(access.role === "admin" ? readLocalCollection<MonthlyCharge>(access.academyId, "monthlyCharges").filter((item) => item.studentId === selectedId) : []);
      setStudentExecutions([]);
      setStudentMessages(readLocalCollection<InternalMessage>(access.academyId, "messages").filter((item) => item.studentId === selectedId));
      return;
    }
    const unsubscribeWorkouts = onSnapshot(query(collection(db, "academies", access.academyId, "workouts"), where("studentId", "==", selectedId)), (snapshot) => {
      setStudentWorkouts(snapshot.docs.map((item) => { const data = item.data() as Omit<WorkoutRecord, "id">; return { id: item.id, ...data, exerciseIds: data.exerciseIds ?? [], exerciseDetails: data.exerciseDetails ?? [], status: (data.status === "draft" ? "draft" : "published") as WorkoutRecord["status"] }; }).filter((item) => item.status === "published"));
    });
    const unsubscribeAssessments = onSnapshot(query(collection(db, "academies", access.academyId, "assessments"), where("studentId", "==", selectedId)), (snapshot) => {
      setStudentAssessments(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AssessmentRecord, "id">) })).sort((a, b) => b.date.localeCompare(a.date)));
    });
    const unsubscribeCharges = access.role === "admin" ? onSnapshot(query(collection(db, "academies", access.academyId, "monthlyCharges"), where("studentId", "==", selectedId)), (snapshot) => {
      setStudentCharges(snapshot.docs.map((item) => { const data = item.data() as Omit<MonthlyCharge, "id">; return { id: item.id, ...data, amount: Number(data.amount ?? 0), status: (data.status === "paid" ? "paid" : "pending") as MonthlyCharge["status"] }; }).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    }) : () => setStudentCharges([]);
    const unsubscribeExecutions = onSnapshot(query(collection(db, "academies", access.academyId, "workoutExecutions"), where("studentId", "==", selectedId)), (snapshot) => {
      setStudentExecutions(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<WorkoutExecution, "id">) })).sort((a, b) => (b.completedAt?.toDate?.().getTime() ?? 0) - (a.completedAt?.toDate?.().getTime() ?? 0)));
    });
    const unsubscribeMessages = onSnapshot(query(collection(db, "academies", access.academyId, "messages"), where("studentId", "==", selectedId)), (snapshot) => {
      setStudentMessages(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<InternalMessage, "id">) })).sort((a, b) => (b.createdAt?.toDate?.().getTime() ?? 0) - (a.createdAt?.toDate?.().getTime() ?? 0)));
    });
    return () => { unsubscribeWorkouts(); unsubscribeAssessments(); unsubscribeCharges(); unsubscribeExecutions(); unsubscribeMessages(); };
  }, [access.academyId, access.role, selectedId]);

  useEffect(() => {
    if (db || !selectedId) return;
    const syncLocalMessages = () => setStudentMessages(readLocalCollection<InternalMessage>(access.academyId, "messages").filter((item) => item.studentId === selectedId));
    window.addEventListener("orquestra-fit:collection-updated", syncLocalMessages);
    return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocalMessages);
  }, [access.academyId, selectedId]);

  async function saveStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (access.role !== "admin") { onFeedback("Somente a gestão pode alterar dados pessoais do aluno."); return; }
    if (!selectedStudent || !editName.trim()) { onFeedback("Informe o nome completo do aluno."); return; }
    if (editName.trim().length < 2) { onFeedback("Informe o nome completo do aluno."); return; }
    if (!validEmail(editEmail.trim())) { onFeedback("Informe um e-mail válido ou deixe o campo vazio."); return; }
    if (!db) {
      const nextStudents = students.map((student) => student.id === selectedStudent.id ? { ...student, name: capitalizeName(editName.trim()), email: editEmail.trim() || null, phone: editPhone.trim() || null, cpf: editCpf.trim() || null, plan: editPlan, teacherId: editTeacherId || null, anatomyProfile: editAnatomyProfile } : student);
      setStudents(nextStudents);
      writeLocalCollection(access.academyId, "students", nextStudents);
      onFeedback("Dados do aluno atualizados no modo local.");
      return;
    }
    setSaving(true);
    try {
      const personalData = {
        name: capitalizeName(editName.trim()),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        cpf: editCpf.trim() || null,
      };
      await updateDoc(doc(db, "academies", access.academyId, "students", selectedStudent.id), access.role === "admin" ? { ...personalData, plan: editPlan, teacherId: editTeacherId || null, anatomyProfile: editAnatomyProfile } : personalData);
      onFeedback("Dados do aluno atualizados.");
    } catch {
      onFeedback("Não foi possível atualizar este aluno.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStudent() {
    if (!selectedStudent) return;
    if (!db) {
      const nextStudents = students.map((student) => student.id === selectedStudent.id ? { ...student, active: selectedStudent.active === false } : student);
      setStudents(nextStudents);
      writeLocalCollection(access.academyId, "students", nextStudents);
      onFeedback(selectedStudent.active === false ? "Acesso do aluno ativado no modo local." : "Acesso do aluno suspenso no modo local.");
      return;
    }
    try {
      await updateDoc(doc(db, "academies", access.academyId, "students", selectedStudent.id), { active: selectedStudent.active === false });
      onFeedback(selectedStudent.active === false ? "Acesso do aluno ativado." : "Acesso do aluno suspenso.");
    } catch {
      onFeedback("Não foi possível alterar o acesso do aluno.");
    }
  }

  async function sendInternalMessage() {
    if (!selectedStudent || !messageBody.trim()) {
      onFeedback("Escreva uma mensagem antes de enviar.");
      return;
    }
    if (!db) {
      const message: InternalMessage = {
        id: `local-message-${crypto.randomUUID()}`,
        studentId: selectedStudent.id,
        senderId: access.userId,
        senderName: accountName(access.user.displayName, access.user.email),
        body: messageBody.trim(),
      };
      const messages = readLocalCollection<InternalMessage>(access.academyId, "messages");
      writeLocalCollection(access.academyId, "messages", [message, ...messages]);
      setMessageBody("");
      onFeedback("Mensagem enviada ao aluno no modo local.");
      return;
    }
    setSendingMessage(true);
    try {
      await addDoc(collection(db, "academies", access.academyId, "messages"), { studentId: selectedStudent.id, senderId: access.userId, senderName: accountName(access.user.displayName, access.user.email), body: messageBody.trim(), createdAt: serverTimestamp(), read: false });
      setMessageBody(""); onFeedback("Mensagem enviada ao aluno.");
    } catch { onFeedback("Não foi possível enviar a mensagem."); }
    finally { setSendingMessage(false); }
  }

  function generateTemporaryPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const random = crypto.getRandomValues(new Uint32Array(12));
    const value = `${alphabet[random[0] % 24]}${alphabet[random[1] % 24]}${alphabet[random[2] % 24]}${alphabet[random[3] % 24]}-${random[4] % 10}${random[5] % 10}${random[6] % 10}${random[7] % 10}${alphabet[random[8] % alphabet.length]}${alphabet[random[9] % alphabet.length]}${random[10] % 10}${random[11] % 10}`;
    setTemporaryPassword(value);
  }

  async function resetStudentPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStudent || !functions || access.role !== "admin") {
      onFeedback("A redefinição segura de senha estará disponível após ativar o serviço da academia.");
      return;
    }
    if (temporaryPassword.length < 10 || !/[A-Za-z]/.test(temporaryPassword) || !/\d/.test(temporaryPassword)) {
      onFeedback("Use uma senha temporária com ao menos 10 caracteres, letras e números.");
      return;
    }
    setResettingPassword(true);
    try {
      await httpsCallable<{ academyId: string; targetUserId: string; newPassword: string }, { ok: boolean }>(functions, "resetMemberPassword")({ academyId: access.academyId, targetUserId: selectedStudent.id, newPassword: temporaryPassword });
      onFeedback("Senha temporária definida. Entregue-a ao aluno por um canal seguro; ele será obrigado a trocá-la ao entrar.");
      setTemporaryPassword("");
      setShowPasswordReset(false);
    } catch (error) {
      const code = (error as { code?: string }).code;
      onFeedback(code === "functions/failed-precondition"
        ? "Esse aluno ainda não ativou o próprio acesso."
        : "Não foi possível redefinir a senha agora.");
    } finally {
      setResettingPassword(false);
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
            <header><div><span>PERFIL DO ALUNO</span><h3>{selectedStudent.name}</h3><p className="student-profile-subtitle">{selectedStudent.email || "E-mail ainda não informado"}</p></div><span className={selectedStudent.active === false ? "detail-status inactive" : "detail-status"}>{selectedStudent.active === false ? "Suspenso" : "Ativo"}</span></header>
            <div className="student-profile-overview"><div><small>PLANO ATUAL</small><strong>{selectedStudent.plan}</strong></div><div><small>TREINOS ATIVOS</small><strong>{studentWorkouts.length}</strong></div><div><small>AVALIAÇÕES</small><strong>{studentAssessments.length}</strong></div><div><small>VISITAS REGISTRADAS</small><strong>{studentExecutions.length}</strong></div></div>
            <div className="student-profile-sections"><section><span>PROGRAMA ATUAL</span>{studentWorkouts.length > 0 ? studentWorkouts.slice(0, 3).map((workout) => <div className="student-profile-row" key={workout.id}><div><strong>{workout.name}</strong><small>{workout.exerciseIds.length} exercícios · publicado para o aluno</small></div><em>Ativo</em></div>) : <p className="student-profile-empty">Nenhum treino publicado ainda.</p>}</section><section><span>EVOLUÇÃO FÍSICA</span>{studentAssessments.length > 0 ? <div className="student-profile-metrics"><div><small>Peso atual</small><strong>{studentAssessments[0].weight} kg</strong></div><div><small>Altura</small><strong>{studentAssessments[0].height} cm</strong></div><div><small>Bíceps</small><strong>{studentAssessments[0].biceps ? `${studentAssessments[0].biceps} cm` : "Não informado"}</strong></div><div><small>Gordura</small><strong>{studentAssessments[0].bodyFat ? `${studentAssessments[0].bodyFat}%` : "Não informado"}</strong></div></div> : <p className="student-profile-empty">Nenhuma avaliação física registrada.</p>}</section><section><span>FINANCEIRO</span>{studentCharges.length > 0 ? <div className="student-profile-row"><div><strong>{studentCharges.filter((charge) => charge.status !== "paid").length > 0 ? "Há cobrança pendente" : "Pagamentos em dia"}</strong><small>{studentCharges.length} cobrança(s) · próxima: {formatDate(studentCharges[0].dueDate)}</small></div><em>{studentCharges.filter((charge) => charge.status !== "paid").length > 0 ? "Acompanhar" : "Regular"}</em></div> : <p className="student-profile-empty">Nenhuma cobrança registrada.</p>}</section></div>
            <div className="student-profile-actions"><button type="button" onClick={() => onNavigate("Treinos", selectedStudent.id)}>Gerenciar treino</button><button type="button" onClick={() => onNavigate("Avaliações", selectedStudent.id)}>Nova avaliação</button>{access.role === "admin" && <button type="button" onClick={() => onNavigate("Planos e mensalidades", selectedStudent.id)}>Ver financeiro</button>}</div>
            <StudentMessagesPanel messages={studentMessages} body={messageBody} sending={sendingMessage} onBodyChange={setMessageBody} onSend={sendInternalMessage} />
            <div className="student-profile-divider"><span>CADASTRO E ACESSO</span></div>
              {access.role === "admin" ? <form className="student-detail-form" onSubmit={saveStudent}>
            <label>Nome completo<input value={editName} onChange={(event) => setEditName(capitalizeName(event.target.value))} autoComplete="name" required /></label>
              <label>Login de contato<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} autoComplete="email" placeholder="E-mail opcional" /></label>
              <label>Telefone<input value={editPhone} onChange={(event) => setEditPhone(maskPhone(event.target.value))} inputMode="tel" placeholder="(00) 00000-0000" /></label>
              <label>CPF<input value={editCpf} onChange={(event) => setEditCpf(maskCpf(event.target.value))} inputMode="numeric" placeholder="000.000.000-00" /></label>
              <label>Perfil anatômico<select value={editAnatomyProfile} onChange={(event) => setEditAnatomyProfile(event.target.value === "feminino" ? "feminino" : "masculino")}><option value="masculino">Masculino</option><option value="feminino">Feminino</option></select><small>Usado para mostrar o boneco correspondente no treino.</small></label>
              {access.role === "admin" ? <label>Plano<select value={editPlan} onChange={(event) => setEditPlan(event.target.value)}><option value="Sem plano">Sem plano</option>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.name}>{plan.name} · R$ {plan.price.toFixed(2).replace(".", ",")}</option>)}</select></label> : <div className="protected-field"><span>Plano atual</span><strong>{selectedStudent.plan}</strong><small>Alteração exclusiva da gestão.</small></div>}
              {access.role === "admin" && <label>Professor responsável<select value={editTeacherId} onChange={(event) => setEditTeacherId(event.target.value)}><option value="">Sem professor definido</option>{teachers.filter((teacher) => teacher.active !== false).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>}
              <button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
            </form> : null}
            {access.role === "admin" && <section className="member-password-reset"><div><span>SEGURANÇA DE ACESSO</span><strong>Senha temporária</strong><p>A senha não é salva no sistema. Ao entrar, o aluno será obrigado a criar a própria senha.</p></div><button className="detail-secondary" type="button" onClick={() => { setShowPasswordReset((current) => !current); setTemporaryPassword(""); }}>{showPasswordReset ? "Cancelar" : "Redefinir senha"}</button>{showPasswordReset && <form onSubmit={resetStudentPassword}><label>Senha temporária<input type="text" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} autoComplete="off" minLength={10} required /></label><div><button className="detail-secondary" type="button" onClick={generateTemporaryPassword}>Gerar senha forte</button><button className="detail-save" type="submit" disabled={resettingPassword || !temporaryPassword}>{resettingPassword ? "Definindo..." : "Confirmar senha temporária"}</button></div></form>}</section>}
            {access.role === "admin" && <button className="detail-toggle" onClick={toggleStudent}>{selectedStudent.active === false ? "Reativar acesso" : "Suspender acesso"}</button>}
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

function ManagerProfilePanel({ profile, onClose, onFeedback }: { profile: AccountProfile | null; onClose: () => void; onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [form, setForm] = useState<AccountProfile>(profile ?? {});
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(profile ?? {}), [profile]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const normalized = {
      ...form,
      name: capitalizeName(form.name?.trim() ?? ""),
      phone: maskPhone(form.phone ?? ""),
      cnpj: maskCnpj(form.cnpj ?? ""),
      cpf: maskCpf(form.cpf ?? ""),
    };
    try {
      if (!db) {
        window.localStorage.setItem(profileStorageKey(access.userId), JSON.stringify(normalized));
        window.dispatchEvent(new Event("orquestra-fit:profile-updated"));
      } else {
        await setDoc(doc(db, "users", access.userId), { ...normalized, updatedAt: serverTimestamp() }, { merge: true });
      }
      onFeedback("Perfil atualizado.");
      onClose();
    } catch {
      onFeedback("Não foi possível atualizar o perfil.");
    } finally {
      setSaving(false);
    }
  }
  const update = (key: keyof AccountProfile, value: string) => {
    const maskedValue = key === "name" ? capitalizeName(value) : key === "phone" ? maskPhone(value) : key === "cnpj" ? maskCnpj(value) : key === "cpf" ? maskCpf(value) : value;
    setForm((current) => ({ ...current, [key]: maskedValue }));
  };
  return <div className="permissions-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-title"><section className="permissions-panel manager-profile-panel"><header><div><span>MEU PERFIL</span><h2 id="profile-title">Perfil do gestor</h2><p>Dados exibidos para a equipe e no rodapé do aplicativo.</p></div><button aria-label="Fechar perfil" onClick={onClose}><X /></button></header><form className="student-detail-form" onSubmit={save}>{form.photoUrl && <img className="manager-profile-photo" src={form.photoUrl} alt="Foto do gestor" />}{(["name", "phone", "cnpj", "cpf", "instagramUrl", "siteUrl"] as const).map((key) => <label key={key}>{({ name: "Nome completo", phone: "Telefone", cnpj: "CNPJ", cpf: "CPF", instagramUrl: "Link do Instagram", siteUrl: "Link do site" } as Record<string, string>)[key]}<input value={form[key] ?? ""} onChange={(event) => update(key, event.target.value)} inputMode={key === "phone" || key === "cpf" || key === "cnpj" ? "numeric" : undefined} /></label>)}<label>URL da foto<input type="url" value={form.photoUrl ?? ""} onChange={(event) => update("photoUrl", event.target.value)} placeholder="https://..." /></label><div className="form-actions"><button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar perfil"}</button><button className="secondary-action" type="button" onClick={() => void logout()}>Sair da conta</button></div></form></section></div>;
}

function AppearancePanel({ theme, onThemeChange, onClose }: { theme: Theme; onThemeChange: (theme: Theme) => void; onClose: () => void }) {
  return <div className="permissions-backdrop" role="dialog" aria-modal="true" aria-labelledby="appearance-title"><section className="permissions-panel appearance-only-panel"><header><div><span>CONFIGURAÇÕES</span><h2 id="appearance-title">Aparência</h2><p>Escolha o tema visual do seu ambiente.</p></div><button aria-label="Fechar aparência" onClick={onClose}><X /></button></header><section className="settings-section appearance-section"><div className="settings-section-heading"><div><span>IDENTIDADE VISUAL</span><h3>Tema do ambiente</h3></div><small>Preferência deste ambiente</small></div><ThemeSwitcher theme={theme} onChange={onThemeChange} /></section></section></div>;
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
    if (!roleToAdd) return;
    setGenerating(true);
    const random = Array.from(crypto.getRandomValues(new Uint32Array(2))).map((value) => value.toString(36).toUpperCase()).join("").slice(0, 8);
    const code = `DF-${random}`;
    try {
      if (db) {
        await setDoc(doc(db, "accessCodes", code), {
          academyId: access.academyId,
          role: roleToAdd,
          active: true,
          createdBy: access.userId,
          createdAt: serverTimestamp(),
        });
      }
      setGeneratedCode(code);
      onFeedback(db ? "Código de convite gerado." : "Código gerado no modo local de demonstração.");
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
          {roleToAdd && <div className="invite-box"><div><span>NOVO CÓDIGO</span><strong>Convite de {roleToAdd === "teacher" ? "professor" : "aluno"}</strong><p>Gere um código e envie para a pessoa criar um login e senha ou entrar com a conta Google.</p></div><button onClick={generateAccessCode} disabled={generating}>{generating ? "Gerando..." : "Gerar código"}</button>{generatedCode && <div className="generated-code"><code>{generatedCode}</code><button onClick={() => navigator.clipboard?.writeText(generatedCode).then(() => onFeedback("Código copiado."))}>Copiar</button></div>}</div>}
        </section>
        <section className="settings-section appearance-section">
          <div className="settings-section-heading"><div><span>IDENTIDADE VISUAL</span><h3>Aparência</h3></div><small>Preferência deste ambiente</small></div>
          <ThemeSwitcher theme={theme} onChange={onThemeChange} />
        </section>
        <section className="settings-section settings-announcement-section">
          <ManagerAnnouncementComposer />
        </section>
        <div className="permissions-note"><ShieldCheck size={18} /><span>O acesso é protegido pelo Firebase. Usuários sem vínculo ativo com esta academia não conseguem abrir os dados.</span></div>
      </section>
    </div>
  );
}

function AdminWorkspace({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const feedback = useFeedback();
  const access = useAccess();
  const registeredProfile = useRegisteredProfile();
  const [newMemberRole, setNewMemberRole] = useState<"student" | "teacher" | null>(null);
  const [registeredStudents, setRegisteredStudents] = useState<RegisteredStudent[]>([]);
  const [dashboardCharges, setDashboardCharges] = useState<MonthlyCharge[]>([]);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [metricsVisible, setMetricsVisible] = useState(true);

  useEffect(() => {
    if (!db) {
      const syncLocalDashboard = () => {
        setRegisteredStudents(readLocalCollection<RegisteredStudent>(access.academyId, "students"));
        setDashboardCharges(readLocalCollection<MonthlyCharge>(access.academyId, "monthlyCharges"));
      };
      syncLocalDashboard();
      window.addEventListener("orquestra-fit:collection-updated", syncLocalDashboard);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocalDashboard);
    }
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
      id: student.id,
      initials: student.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      name: student.name,
      plan: student.plan,
      status: student.active === false ? "Inativo" : "Ativo",
      visits: "—",
      next: "A definir",
    }));
  const visibleStudents = students.filter((student) => `${student.name} ${student.plan}`.toLowerCase().includes(dashboardSearch.trim().toLowerCase()));
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
          <div><span>OPERAÇÃO DA ACADEMIA · DADOS REAIS</span><h2>Olá, {firstName(registeredProfile?.name || registeredProfile?.displayName || access.user.displayName, access.user.email)}.</h2><p>Uma leitura direta da operação para você decidir o que precisa de atenção hoje.</p></div>
          <button onClick={() => setNewMemberRole("student")}><Plus /> Novo aluno</button>
        </section>
        <div className="dashboard-metrics-heading"><span>INDICADORES</span><button type="button" onClick={() => setMetricsVisible((visible) => !visible)} aria-label={metricsVisible ? "Ocultar indicadores" : "Mostrar indicadores"}>{metricsVisible ? <EyeOff /> : <Eye />}<span>{metricsVisible ? "Ocultar valores" : "Mostrar valores"}</span></button></div>
        <section className={metricsVisible ? "metric-grid" : "metric-grid metrics-hidden"}>
          <MetricCard icon={Users} label="Alunos ativos" value={metricsVisible ? String(registeredStudents.filter((student) => student.active !== false).length) : "••••"} note={metricsVisible ? `${registeredStudents.length} cadastro${registeredStudents.length === 1 ? "" : "s"} total` : "Valor protegido"} />
          <MetricCard icon={CircleDollarSign} label="Receita prevista" value={metricsVisible ? money(dashboardTotal) : "R$ ••••"} note={metricsVisible ? `${dashboardPercent}% já recebido` : "Valor protegido"} />
          <MetricCard icon={Banknote} label="Em aberto" value={metricsVisible ? money(dashboardOpen) : "R$ ••••"} note={metricsVisible ? `${dashboardCharges.filter((charge) => charge.status !== "paid").length} mensalidades` : "Valor protegido"} warning={dashboardOpen > 0} />
          <MetricCard icon={Activity} label="Frequência hoje" value={metricsVisible ? "—" : "••••"} note={metricsVisible ? "Sem registros ainda" : "Valor protegido"} />
        </section>
        <section className="operations-grid">
          <article className="workspace-panel student-table-panel">
            <header><div><span>OPERAÇÃO</span><h3>Alunos para acompanhar</h3><p>Planos, frequência e próximos treinos.</p></div><button onClick={() => navigateWorkspace("Alunos")}>Ver todos <ArrowRight /></button></header>
            <div className="workspace-search"><Search /><input value={dashboardSearch} onChange={(event) => setDashboardSearch(event.target.value)} placeholder="Buscar aluno" aria-label="Buscar aluno" /></div>
            <div className="student-table">
              <div className="table-row table-head"><span>Aluno</span><span>Plano</span><span>Situação</span><span>Visitas</span><span>Próximo treino</span><span /></div>
              {visibleStudents.length === 0 ? <div className="directory-empty"><Users /><p>{students.length === 0 ? "Nenhum aluno cadastrado ainda." : "Nenhum aluno encontrado."}</p></div> : visibleStudents.map((student) => (
                <div className="table-row" key={student.id}>
                  <span className="table-person"><i>{student.initials}</i><strong>{student.name}</strong></span>
                  <span>{student.plan}</span>
                  <span><em className={student.status === "Em atraso" ? "late" : student.status === "Vence hoje" ? "due" : ""}>{student.status}</em></span>
                  <span>{student.visits}</span><span>{student.next}</span><button aria-label={`Abrir ${student.name}`} onClick={() => navigateWorkspace("Alunos", student.id)}><ChevronRight /></button>
                </div>
              ))}
            </div>
          </article>
          <aside className="workspace-panel finance-card">
            <header><div><span>FINANCEIRO</span><h3>Recebimentos do mês</h3></div><button aria-label="Abrir financeiro" onClick={() => navigateWorkspace("Planos e mensalidades")}><MoreHorizontal /></button></header>
            <div className="finance-total"><small>PREVISTO</small><strong>{money(dashboardTotal)}</strong><span>{dashboardCharges.length} mensalidades cadastradas</span></div>
            <div className="finance-bar"><i style={{ width: `${dashboardPercent}%` }} /><b style={{ width: `${Math.max(0, 100 - dashboardPercent)}%` }} /></div>
            <div className="finance-legend">
              <div><span><i className="received" />Recebido</span><strong>{money(dashboardReceived)}</strong></div>
              <div><span><i className="pending" />Em aberto</span><strong>{money(dashboardOpen)}</strong></div>
              <div><span><i className="overdue" />Em atraso</span><strong>{money(dashboardOverdue.reduce((total, charge) => total + charge.amount, 0))}</strong></div>
            </div>
            <button className="outline-action" onClick={() => navigateWorkspace("Planos e mensalidades")}>Abrir financeiro <ArrowRight /></button>
          </aside>
        </section>
        <section className="admin-lower">
          <article><span>AÇÕES RÁPIDAS</span><h3>O que precisa acontecer hoje</h3><div><button onClick={() => setNewMemberRole("teacher")}><UserRoundCheck />Cadastrar professor</button><button onClick={() => navigateWorkspace("Treinos")}><ClipboardList />Montar ficha de treino</button><button onClick={() => navigateWorkspace("Aulas e reservas")}><CalendarDays />Criar aula</button></div></article>
          <article className="occupancy"><div><span>OCUPAÇÃO AGORA</span><strong>Sem registros</strong></div><div className="directory-empty"><p>A frequência da academia aparecerá aqui quando houver acessos registrados.</p></div></article>
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
  const [anatomyProfile, setAnatomyProfile] = useState<"masculino" | "feminino">("masculino");
  const [code, setCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Informe o nome completo.");
      return;
    }
    setSaving(true);
    setError(null);
    const random = Array.from(crypto.getRandomValues(new Uint32Array(2))).map((value) => value.toString(36).toUpperCase()).join("").slice(0, 8);
    const invitationCode = `DF-${random}`;
    try {
      if (db) {
        await setDoc(doc(db, "accessCodes", invitationCode), {
          academyId: access.academyId,
          role,
          invitedName: capitalizeName(name.trim()),
          invitedEmail: email.trim() || null,
          ...(role === "student" ? { plan, anatomyProfile } : {}),
          active: true,
          createdBy: access.userId,
          createdAt: serverTimestamp(),
        });
      } else {
        const id = `local-${role}-${Date.now()}`;
        if (role === "student") {
          const students = readLocalCollection<RegisteredStudent>(access.academyId, "students");
          writeLocalCollection(access.academyId, "students", [...students, { id, name: capitalizeName(name.trim()), email: email.trim() || null, plan, teacherId: null, anatomyProfile, active: true }]);
        } else {
          const teachers = readLocalCollection<RegisteredTeacher>(access.academyId, "teachers");
          writeLocalCollection(access.academyId, "teachers", [...teachers, { id, name: capitalizeName(name.trim()), email: email.trim() || null, active: true }]);
        }
      }
      setCode(invitationCode);
      onFeedback(`${role === "student" ? "Aluno" : "Professor"} cadastrado. Envie o código para ativar o acesso.`);
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
            <label>Nome completo<input value={name} onChange={(event) => setName(capitalizeName(event.target.value))} autoComplete="name" required /></label>
            <label>E-mail Google <small>(opcional)</small><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="aluno@exemplo.com" /></label>
            {role === "student" && <label>Plano<select value={plan} onChange={(event) => setPlan(event.target.value)}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></label>}
            {role === "student" && <label>Perfil anatômico<select value={anatomyProfile} onChange={(event) => setAnatomyProfile(event.target.value === "feminino" ? "feminino" : "masculino")}><option value="masculino">Masculino</option><option value="feminino">Feminino</option></select><small>Define o modelo exibido durante o treino.</small></label>}
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

function ProfessorWorkspace({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const access = useAccess();
  const registeredProfile = useRegisteredProfile();
  const feedback = useFeedback();
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [teacherStudentCount, setTeacherStudentCount] = useState(0);
  const [teacherWorkoutCount, setTeacherWorkoutCount] = useState(0);
  useEffect(() => {
    if (!db) return;
    const unsubscribeStudents = onSnapshot(query(collection(db, "academies", access.academyId, "students"), where("teacherId", "==", access.userId)), (snapshot) => setTeacherStudentCount(snapshot.size));
    const unsubscribeWorkouts = onSnapshot(query(collection(db, "academies", access.academyId, "workouts"), where("createdBy", "==", access.userId)), (snapshot) => setTeacherWorkoutCount(snapshot.size));
    return () => { unsubscribeStudents(); unsubscribeWorkouts(); };
  }, [access.academyId, access.userId]);
  const today: Array<{ time: string; name: string; focus: string; status: string }> = [];
  return (
    <WorkspaceShell profile="Professor" theme={theme} onThemeChange={onThemeChange}>
      {trainingOpen ? <TrainingModule onFeedback={feedback} /> : <div className="workspace-content">
        <section className="workspace-intro">
          <div><span>ACOMPANHAMENTO · PROFESSOR</span><h2>Olá, {firstName(registeredProfile?.name || registeredProfile?.displayName || access.user.displayName, access.user.email)}.</h2><p>Seus alunos, no ritmo certo. Acompanhe quem precisa de treino novo, revisão ou avaliação.</p></div>
          <button onClick={() => setTrainingOpen(true)}><Plus /> Criar treino</button>
        </section>
        <section className="professor-summary">
          <article className="professor-focus">
            <span>PRÓXIMO ATENDIMENTO</span><div className="focus-time">— <small>AGUARDANDO AGENDA</small></div>
            <div className="focus-student"><i>—</i><div><strong>Nenhum atendimento agendado</strong><p>Os próximos compromissos aparecerão aqui.</p></div></div>
            <button onClick={() => navigateWorkspace("Aulas e reservas")}>Ver agenda <ArrowRight /></button>
          </article>
          <div className="professor-metrics">
            <MetricCard icon={Users} label="Meus alunos" value={String(teacherStudentCount)} note={teacherStudentCount === 0 ? "Nenhum aluno vinculado" : "Alunos vinculados"} />
            <MetricCard icon={ClipboardList} label="Treinos publicados" value={String(teacherWorkoutCount)} note={teacherWorkoutCount === 0 ? "Nenhum treino publicado" : "Treinos no sistema"} warning={false} />
          </div>
        </section>
        <section className="professor-grid">
          <article className="workspace-panel agenda-panel">
            <header><div><span>AGENDA DE HOJE</span><h3>Atendimentos</h3></div><button onClick={() => navigateWorkspace("Aulas e reservas")}>Ver semana <ArrowRight /></button></header>
            {today.length > 0 ? today.map((item) => (
              <div className="appointment" key={item.time}><strong>{item.time}</strong><div><h4>{item.name}</h4><p>{item.focus}</p></div><em className={item.status === "Confirmado" ? "confirmed" : ""}>{item.status}</em><button aria-label="Abrir" onClick={() => feedback(`Atendimento de ${item.name} selecionado.`)}><ChevronRight /></button></div>
            )) : <div className="directory-empty"><CalendarDays /><p>Nenhum atendimento cadastrado ainda.</p></div>}
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
        <div className="drawer-footer"><small>TECNOLOGIA</small><strong>Orquestra Fit</strong></div>
      </aside>
    </div>
  );
}

function ManagerAnnouncementComposer() {
  const access = useAccess();
  const feedback = useFeedback();
  const profile = useRegisteredProfile();
  const announcements = useAcademyAnnouncements();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) { feedback("Informe o título e o texto do comunicado."); return; }
    setSending(true);
    const senderName = profile?.name || profile?.displayName || accountName(access.user.displayName, access.user.email);
    try {
      if (!db) {
        const announcement: AcademyAnnouncement = { id: `local-announcement-${Date.now()}`, title: capitalizeName(title.trim()), body: body.trim(), senderName };
        writeLocalCollection(access.academyId, "announcements", [announcement, ...announcements]);
      } else {
        await addDoc(collection(db, "academies", access.academyId, "announcements"), { title: capitalizeName(title.trim()), body: body.trim(), senderName, senderId: access.userId, createdAt: serverTimestamp() });
      }
      setTitle(""); setBody(""); feedback("Comunicado publicado para toda a academia.");
    } catch { feedback("Não foi possível publicar o comunicado."); }
    finally { setSending(false); }
  }
  return <section className="workspace-panel announcement-composer">
    <header><div><span>COMUNICAÇÃO GERAL</span><h3>Comunicado da academia</h3><p>O aviso aparece na página inicial e nas notificações de todos.</p></div><Bell /></header>
    <form onSubmit={publish}><label>Título<input value={title} onChange={(event) => setTitle(capitalizeName(event.target.value))} placeholder="Ex.: Horário especial neste sábado" maxLength={80} /></label><label>Mensagem<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escreva um aviso curto e objetivo." maxLength={280} /></label><button type="submit" disabled={sending || !title.trim() || !body.trim()}>{sending ? "Publicando..." : "Publicar para todos"}</button></form>
    {announcements[0] && <div className="announcement-latest"><span>ÚLTIMO PUBLICADO</span><strong>{announcements[0].title}</strong><p>{announcements[0].body}</p></div>}
  </section>;
}

function AcademyFooter() {
  const access = useAccess();
  const [academy, setAcademy] = useState<{ instagramUrl?: string; siteUrl?: string }>({});
  useEffect(() => { if (!db) return; return onSnapshot(doc(db, "academies", access.academyId), (snapshot) => setAcademy(snapshot.exists() ? snapshot.data() as { instagramUrl?: string; siteUrl?: string } : {})); }, [access.academyId]);
  return <footer className="academy-footer"><span>Dama de Ferro Academia</span><div>{academy.instagramUrl && <a href={academy.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}{academy.siteUrl && <a href={academy.siteUrl} target="_blank" rel="noreferrer">Site oficial</a>}</div></footer>;
}
