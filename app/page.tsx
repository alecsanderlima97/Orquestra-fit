"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword, updateProfile } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import {
  Activity, ArrowLeft, ArrowRight, ArrowUp, Banknote, BarChart3, Bell, CalendarDays, Camera, Check, Footprints,
  ChevronDown, ChevronRight, CircleDollarSign, ClipboardList, Clock3, Dumbbell, Flame, Gauge,
  House, LayoutDashboard, Menu, MoreHorizontal, Palette, Play, Plus, Printer, Search, Settings,
  Eye, EyeOff, PersonStanding, QrCode, Share2, ShieldCheck, Sparkles, Trophy, User, UserRoundCheck, Users, WalletCards, MessageCircle, Package, X,
} from "lucide-react";
import { useAccess } from "@/components/auth/access-context";
import { ExerciseAnatomyView, type ExerciseAnatomyData } from "@/components/workouts/exercise-anatomy-view";
import { WorkoutSessionView } from "@/components/workouts/workout-session-view";
import { WorkoutShareCard } from "@/components/workouts/workout-share-card";
import { FinanceModule } from "@/components/finance/finance-module-v2";
import { AppGuide } from "@/components/assistant/app-guide";
import { StockModule } from "@/components/stock/stock-module";
import { auth, db, functions, storage } from "@/lib/firebase/client";
import { verifiedFemaleGifUrls } from "@/lib/workouts/verified-female-gifs";

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

function workoutInProgressKey(academyId: string, userId: string) {
  return `orquestra-fit:${academyId}:workout-in-progress:${userId}`;
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

function calculateAge(birthDate?: string | null, referenceDate = new Date()) {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = referenceDate.getFullYear() - year;
  if (referenceDate.getMonth() + 1 < month || (referenceDate.getMonth() + 1 === month && referenceDate.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

function scrollToContent(selector: string) {
  window.setTimeout(() => document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

function brazilGreeting() {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

function brazilLongDate() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date()).toLocaleUpperCase("pt-BR");
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

function BirthdayGreeting() {
  const access = useAccess();
  const [student, setStudent] = useState<{ name?: string; birthDate?: string } | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const studentId = localStudentId(access.academyId, access.userId);
    if (!db) {
      setStudent(readLocalCollection<{ id: string; name?: string; birthDate?: string }>(access.academyId, "students").find((item) => item.id === studentId) ?? null);
      return;
    }
    return onSnapshot(doc(db, "academies", access.academyId, "students", studentId), (snapshot) => setStudent(snapshot.exists() ? snapshot.data() as { name?: string; birthDate?: string } : null));
  }, [access.academyId, access.userId]);
  useEffect(() => {
    if (!student?.birthDate) return;
    const today = new Date();
    const [, month, day] = student.birthDate.split("-").map(Number);
    const annualKey = `orquestra-fit:birthday:${access.academyId}:${access.userId}:${today.getFullYear()}`;
    if (today.getMonth() + 1 === month && today.getDate() === day && !window.localStorage.getItem(annualKey)) {
      setVisible(true);
      window.localStorage.setItem(annualKey, "shown");
    }
  }, [access.academyId, access.userId, student]);
  if (!visible) return null;
  return <div className="birthday-backdrop" role="dialog" aria-modal="true" aria-label="Mensagem de aniversário"><section className="birthday-card"><Sparkles /><small>DAMA DE FERRO ACADEMIA</small><h2>Feliz aniversário, {firstName(student?.name ?? null, null)}!</h2><p>Que seu novo ciclo venha com muita saúde, força e conquistas. É um prazer ter você treinando com a gente.</p><button type="button" onClick={() => setVisible(false)}>Começar meu dia</button></section></div>;
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
  ,["Supino declinado com barra", "Peito", "Tríceps, ombros", "Peitoral inferior"]
  ,["Crossover na polia", "Peito", "Ombros", "Peitoral"]
  ,["Pullover com halter", "Peito", "Dorsais, tríceps", "Peitoral e dorsais"]
  ,["Barra fixa", "Costas", "Bíceps", "Dorsais"]
  ,["Remada curvada com barra", "Costas", "Bíceps, lombar", "Dorsais e região central das costas"]
  ,["Remada cavalinho", "Costas", "Bíceps", "Dorsais"]
  ,["Pulldown com braços estendidos", "Costas", "Tríceps", "Dorsais"]
  ,["Encolhimento com halteres", "Trapézio", "Ombros", "Trapézio"]
  ,["Desenvolvimento militar com barra", "Ombros", "Tríceps", "Ombros"]
  ,["Elevação frontal", "Ombros", "Peitoral superior", "Ombro anterior"]
  ,["Crucifixo inverso", "Ombros", "Costas", "Ombro posterior"]
  ,["Rosca Scott", "Bíceps", "Antebraço", "Parte frontal do braço"]
  ,["Rosca concentrada", "Bíceps", "Antebraço", "Parte frontal do braço"]
  ,["Rosca na polia", "Bíceps", "Antebraço", "Parte frontal do braço"]
  ,["Tríceps testa", "Tríceps", "Ombros", "Parte posterior do braço"]
  ,["Tríceps coice", "Tríceps", "Ombros", "Parte posterior do braço"]
  ,["Mergulho nas paralelas", "Tríceps", "Peito, ombros", "Parte posterior do braço"]
  ,["Agachamento sumô", "Glúteos", "Adutores, quadríceps", "Glúteos e coxas"]
  ,["Agachamento búlgaro", "Quadríceps", "Glúteos, posteriores", "Coxas e glúteos"]
  ,["Hack squat", "Quadríceps", "Glúteos", "Parte frontal da coxa"]
  ,["Cadeira adutora", "Adutores", "Glúteos", "Parte interna da coxa"]
  ,["Cadeira abdutora", "Abdutores", "Glúteos", "Parte externa da coxa"]
  ,["Stiff com halteres", "Posteriores", "Glúteos, lombar", "Posteriores da coxa"]
  ,["Cadeira flexora", "Posteriores", "Glúteos", "Parte posterior da coxa"]
  ,["Glúteo na polia", "Glúteos", "Posteriores", "Glúteos"]
  ,["Panturrilha sentada", "Panturrilhas", "", "Panturrilhas"]
  ,["Abdominal supra", "Abdômen", "Core", "Abdômen"]
  ,["Abdominal infra", "Abdômen", "Core", "Abdômen inferior"]
  ,["Abdominal oblíquo", "Abdômen", "Core", "Laterais do abdômen"]
  ,["Prancha lateral", "Core", "Ombros, oblíquos", "Região central lateral"]
  ,["Elevação de pernas", "Abdômen", "Flexores do quadril", "Abdômen inferior"]
  ,["Burpee", "Cardio", "Corpo inteiro", "Condicionamento cardiovascular"]
  ,["Corda naval", "Cardio", "Ombros, core", "Condicionamento cardiovascular"]
  ,["Remo ergométrico", "Cardio", "Costas, pernas", "Condicionamento cardiovascular"]
  ,["Escada ergométrica", "Cardio", "Pernas, glúteos", "Condicionamento cardiovascular"]
  ,["Mobilidade de ombros", "Mobilidade", "Ombros, peitoral", "Ombros"]
  ,["Mobilidade de tornozelo", "Mobilidade", "Panturrilhas", "Tornozelos"]
  ,["Alongamento de posteriores", "Posteriores", "Lombar", "Parte posterior da coxa"]
  ,["Alongamento de panturrilha", "Panturrilhas", "", "Panturrilhas"]
  ,["Alongamento de dorsais", "Costas", "Ombros", "Dorsais"]
  ,["Supino reto na máquina", "Peito", "Tríceps, ombros", "Peitoral"]
  ,["Supino inclinado na máquina", "Peito", "Tríceps, ombros", "Peitoral superior"]
  ,["Chest press articulado", "Peito", "Tríceps, ombros", "Peitoral"]
  ,["Crucifixo com halteres", "Peito", "Ombros", "Peitoral"]
  ,["Crucifixo na polia baixa", "Peito", "Ombros", "Peitoral superior"]
  ,["Crucifixo na polia alta", "Peito", "Ombros", "Peitoral inferior"]
  ,["Flexão inclinada", "Peito", "Tríceps, ombros", "Peitoral inferior"]
  ,["Flexão declinada", "Peito", "Tríceps, ombros", "Peitoral superior"]
  ,["Puxada neutra na máquina", "Costas", "Bíceps", "Dorsais"]
  ,["Puxada supinada", "Costas", "Bíceps", "Dorsais"]
  ,["Remada articulada", "Costas", "Bíceps", "Dorsais e romboides"]
  ,["Remada alta na polia", "Trapézio", "Ombros, bíceps", "Trapézio"]
  ,["Remada máquina com apoio", "Costas", "Bíceps", "Dorsais"]
  ,["Graviton barra assistida", "Costas", "Bíceps", "Dorsais"]
  ,["Pullover na máquina", "Costas", "Peito, tríceps", "Dorsais"]
  ,["Desenvolvimento na máquina", "Ombros", "Tríceps", "Ombros"]
  ,["Desenvolvimento Arnold", "Ombros", "Tríceps", "Ombros"]
  ,["Elevação lateral na máquina", "Ombros", "Trapézio", "Ombro lateral"]
  ,["Elevação lateral na polia", "Ombros", "Trapézio", "Ombro lateral"]
  ,["Elevação frontal com anilha", "Ombros", "Peitoral superior", "Ombro anterior"]
  ,["Crucifixo inverso na máquina", "Ombros", "Costas", "Ombro posterior"]
  ,["Rotação externa na polia", "Ombros", "Manguito rotador", "Ombro posterior"]
  ,["Rosca bíceps na máquina", "Bíceps", "Antebraço", "Parte frontal do braço"]
  ,["Rosca Scott na máquina", "Bíceps", "Antebraço", "Parte frontal do braço"]
  ,["Rosca inclinada com halteres", "Bíceps", "Antebraço", "Parte frontal do braço"]
  ,["Rosca 21", "Bíceps", "Antebraço", "Parte frontal do braço"]
  ,["Rosca inversa com barra", "Antebraço", "Bíceps", "Antebraços"]
  ,["Extensão de punho", "Antebraço", "", "Antebraços"]
  ,["Flexão de punho", "Antebraço", "", "Antebraços"]
  ,["Farmer walk", "Antebraço", "Trapézio, core", "Antebraços"]
  ,["Tríceps na máquina", "Tríceps", "Ombros", "Parte posterior do braço"]
  ,["Tríceps corda", "Tríceps", "Ombros", "Parte posterior do braço"]
  ,["Tríceps unilateral na polia", "Tríceps", "Ombros", "Parte posterior do braço"]
  ,["Mergulho no banco", "Tríceps", "Peito, ombros", "Parte posterior do braço"]
  ,["Leg press horizontal", "Quadríceps", "Glúteos, posteriores", "Coxas"]
  ,["Leg press vertical", "Quadríceps", "Glúteos, posteriores", "Coxas"]
  ,["Agachamento no Smith", "Quadríceps", "Glúteos, posteriores", "Coxas e glúteos"]
  ,["Passada no Smith", "Quadríceps", "Glúteos, posteriores", "Coxas e glúteos"]
  ,["Extensão de quadril na máquina", "Glúteos", "Posteriores", "Glúteos"]
  ,["Coice na máquina", "Glúteos", "Posteriores", "Glúteos"]
  ,["Glúteo quatro apoios", "Glúteos", "Posteriores", "Glúteos"]
  ,["Elevação pélvica na máquina", "Glúteos", "Posteriores", "Glúteos"]
  ,["Flexora em pé unilateral", "Posteriores", "Glúteos", "Parte posterior da coxa"]
  ,["Bom dia com barra", "Posteriores", "Glúteos, lombar", "Posteriores da coxa"]
  ,["Panturrilha no leg press", "Panturrilhas", "", "Panturrilhas"]
  ,["Panturrilha no Smith", "Panturrilhas", "", "Panturrilhas"]
  ,["Abdominal na polia", "Abdômen", "Core", "Abdômen"]
  ,["Abdominal no banco declinado", "Abdômen", "Core", "Abdômen"]
  ,["Abdominal remador", "Abdômen", "Flexores do quadril", "Abdômen"]
  ,["Woodchopper na polia", "Core", "Oblíquos", "Região central lateral"]
  ,["Hiperextensão lombar", "Lombar", "Glúteos, posteriores", "Região lombar"]
  ,["Sled push", "Cardio", "Pernas, ombros", "Condicionamento cardiovascular"]
  ,["Air bike", "Cardio", "Pernas, braços", "Condicionamento cardiovascular"]
  ,["Afundo com halteres", "Quadríceps", "Glúteos, posteriores", "Coxas e glúteos"]
  ,["Levantamento terra com barra", "Posteriores", "Glúteos, lombar", "Posteriores da coxa e lombar"]
  ,["Levantamento terra sumô com barra", "Glúteos", "Adutores, quadríceps, posteriores", "Glúteos e coxas"]
  ,["Agachamento frontal com barra", "Quadríceps", "Glúteos, core", "Parte frontal da coxa"]
  ,["Agachamento goblet com halter", "Quadríceps", "Glúteos, core", "Coxas e glúteos"]
  ,["Step-up com halteres", "Quadríceps", "Glúteos, posteriores", "Coxas e glúteos"]
  ,["Puxada unilateral na polia", "Costas", "Bíceps", "Dorsais"]
  ,["Remada alta com barra", "Trapézio", "Ombros, bíceps", "Trapézio e ombros"]
  ,["Supino fechado com barra", "Tríceps", "Peito, ombros", "Parte posterior do braço"]
  ,["Tríceps acima da cabeça na polia", "Tríceps", "Ombros", "Parte posterior do braço"]
] as const;

function starterClassification(name: string, muscleGroup: string): { bodyRegion: BodyRegion; phase: ExercisePhase; exerciseType: ExerciseType } {
  const normalizedName = name.toLocaleLowerCase("pt-BR");
  if (normalizedName.includes("alongamento") || normalizedName.includes("mobilidade")) return { bodyRegion: ["Peito"].includes(muscleGroup) ? "Tronco anterior" : ["Costas"].includes(muscleGroup) ? "Tronco posterior" : ["Mobilidade"].includes(muscleGroup) && normalizedName.includes("ombro") ? "Membros superiores" : "Membros inferiores", phase: "Preparação", exerciseType: "Alongamento" };
  if (muscleGroup === "Cardio") return { bodyRegion: "Membros inferiores", phase: "Cardio", exerciseType: "Cardio" };
  if (["Core", "Abdômen"].includes(muscleGroup)) return { bodyRegion: "Região central", phase: "Treino principal", exerciseType: normalizedName.includes("prancha") ? "Peso corporal" : "Força" };
  if (["Flexão de braços", "Agachamento com peso corporal", "Avanço com peso corporal"].includes(name)) return { bodyRegion: muscleGroup === "Peito" ? "Tronco anterior" : "Membros inferiores", phase: "Treino principal", exerciseType: "Peso corporal" };
  if (["Costas", "Trapézio", "Lombar"].includes(muscleGroup)) return { bodyRegion: "Tronco posterior", phase: "Treino principal", exerciseType: "Força" };
  if (muscleGroup === "Peito") return { bodyRegion: "Tronco anterior", phase: "Treino principal", exerciseType: "Força" };
  if (["Ombros", "Bíceps", "Tríceps", "Antebraço"].includes(muscleGroup)) return { bodyRegion: "Membros superiores", phase: "Treino principal", exerciseType: "Força" };
  return { bodyRegion: "Membros inferiores", phase: "Treino principal", exerciseType: normalizedName.includes("peso corporal") ? "Peso corporal" : "Força" };
}

function exerciseArtwork(name: string, group: string, bodyRegion?: BodyRegion) {
  const normalized = name.toLocaleLowerCase("pt-BR");
  if (normalized.includes("rosca martelo")) return "/exercise-art/hammer-curl-anatomy-v1.png";
  if (["supino", "crucifixo", "crossover", "flexão", "pullover"].some((term) => normalized.includes(term))) return "/exercise-art/chest-press-anatomy-v1.png";
  if (["puxada", "remada", "barra fixa", "pulldown", "face pull"].some((term) => normalized.includes(term))) return "/exercise-art/back-row-anatomy-v1.png";
  if (["prancha", "abdominal", "elevação de pernas"].some((term) => normalized.includes(term)) || ["Core", "Abdômen"].includes(group)) return "/exercise-art/plank-anatomy-v1.png";
  if (["agachamento", "leg press", "afundo", "avanço", "cadeira", "mesa flexora", "terra", "stiff", "hip thrust", "glúteo", "panturrilha", "hack squat"].some((term) => normalized.includes(term)) || bodyRegion === "Membros inferiores") return "/exercise-art/squat-anatomy-v1.png";
  if (bodyRegion === "Tronco posterior") return "/anatomy-body-back.png";
  return "/anatomy-body-base.png";
}

function gifCatalogQuery(name: string, muscleGroup: string) {
  const normalized = `${name} ${muscleGroup}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("rosca martelo")) return "hammer curl";
  if (normalized.includes("rosca scott")) return "preacher curl";
  if (normalized.includes("rosca concentrada")) return "concentration curl";
  if (normalized.includes("rosca alternada")) return "alternate biceps curl";
  if (normalized.includes("rosca direta")) return "barbell curl";
  if (normalized.includes("rosca inversa")) return "reverse curl";
  if (normalized.includes("rosca") || normalized.includes("biceps")) return "curl";
  if (normalized.includes("supino reto com barra")) return "barbell bench press";
  if (normalized.includes("supino reto")) return "bench press";
  if (normalized.includes("supino inclinado")) return normalized.includes("halter") ? "dumbbell incline bench press" : "incline bench press";
  if (normalized.includes("supino declinado")) return "decline bench press";
  if (normalized.includes("crucifixo na maquina")) return "pec deck fly";
  if (normalized.includes("crucifixo inverso")) return "rear delt fly";
  if (normalized.includes("crucifixo")) return "fly chest";
  if (normalized.includes("face pull")) return "face pull";
  if (normalized.includes("remada unilateral")) return "one arm row";
  if (normalized.includes("remada baixa")) return "seated row";
  if (normalized.includes("remada")) return "row";
  if (normalized.includes("puxada")) return "pulldown";
  if (normalized.includes("agachamento")) return "squat";
  if (normalized.includes("leg press 45")) return "45 degrees leg press";
  if (normalized.includes("leg press")) return "leg press";
  if (normalized.includes("extensora")) return "leg extension";
  if (normalized.includes("flexora")) return "leg curl";
  if (normalized.includes("panturrilha")) return "calf raise";
  if (normalized.includes("triceps")) return "triceps";
  if (normalized.includes("ombro") || normalized.includes("elevacao") || normalized.includes("desenvolvimento")) return "shoulder";
  if (normalized.includes("peito") || normalized.includes("peitoral")) return "chest";
  if (normalized.includes("costas") || normalized.includes("dorsais")) return "back";
  if (normalized.includes("quadriceps") || normalized.includes("perna")) return "thighs";
  if (normalized.includes("quadril") || normalized.includes("gluteo")) return "hip";
  if (normalized.includes("abdominal") || normalized.includes("core")) return "abs";
  return muscleGroup;
}

function gifCatalogFilters(name: string, muscleGroup: string) {
  const normalized = `${name} ${muscleGroup}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const equipment = normalized.includes("halter") || normalized.includes("arnold") ? "EXERCÍCIOS COM HALTERES"
    : normalized.includes("barra") ? "EXERCÍCIOS COM BARRAS"
    : normalized.includes("polia") || normalized.includes("crossover") || normalized.includes("face pull") || normalized.includes("woodchopper") ? "EXERCÍCIOS NO CABO  OU POLIA"
    : normalized.includes("maquina") || normalized.includes("cadeira") || normalized.includes("leg press") || normalized.includes("hack") || normalized.includes("smith") || normalized.includes("graviton") ? "EXERCÍCIOS NA MAQUINA - HACK - BANCO"
    : normalized.includes("kettlebell") ? "KETTLEBELL"
    : normalized.includes("eliptico") || normalized.includes("esteira") || normalized.includes("bicicleta") || normalized.includes("remo ergometrico") || normalized.includes("escada") || normalized.includes("air bike") ? "CARDIO"
    : "";
  const muscle = normalized.includes("peito") || normalized.includes("peitoral") ? "PEITO"
    : normalized.includes("costas") || normalized.includes("dorsais") ? "COSTAS"
    : normalized.includes("ombro") || normalized.includes("elevacao") || normalized.includes("desenvolvimento") || normalized.includes("face pull") ? "OMBRO"
    : normalized.includes("triceps") ? "TRICEPS"
    : normalized.includes("biceps") ? "BICEPS"
    : normalized.includes("antebraco") || normalized.includes("punho") ? "ANTEBRAÇO"
    : normalized.includes("panturrilha") ? "PANTURRILHA"
    : normalized.includes("abdominal") || normalized.includes("prancha") || normalized.includes("woodchopper") ? "ABDOMINAIS"
    : normalized.includes("quadriceps") || normalized.includes("gluteo") || normalized.includes("posterior") || normalized.includes("agachamento") || normalized.includes("leg press") || normalized.includes("stiff") || normalized.includes("afundo") ? "PERNA"
    : "";
  return { equipment, muscle };
}

type VerifiedExerciseGif = { maleFile: string; femaleUrl?: string; match?: "exact" | "equivalent" };

// Esta lista contém somente movimentos revisados manualmente pelo nome, equipamento e grupo muscular.
// Os demais permanecem sem vínculo automático para nunca exibir uma execução incorreta ao aluno.
const verifiedExerciseGifs: Record<string, VerifiedExerciseGif> = {
  "supino reto com barra": { maleFile: "EXERCÍCIOS COM BARRAS/PEITO/Barbell-Bench-Press_Chest-FIX2__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1B5w3919f20qo0gDarihzlkLXQGxPvC2Z&export=download&confirm=t" },
  "supino inclinado com halteres": { maleFile: "EXERCÍCIOS COM HALTERES/PEITO/Dumbbell-Palms-In-Incline-Bench-Press_converted.gif" },
  "crucifixo na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PEITO/Lever-Pec-Deck-Fly_Chest__converted.gif" },
  "remada curvada com barra": { maleFile: "EXERCÍCIOS COM BARRAS/COSTAS/Barbell-Bent-Over-Row_Back__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1K0h1jwWznAaU0dk0W3nh0L9lQsNOy98f&export=download&confirm=t" },
  "pulldown com bracos estendidos": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/COSTAS/Cable-Straight-Arm-Pulldown_Back-FIX__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1NEK5GY2HinQBD-IPuuHBRMYqRXLQjjYO&export=download&confirm=t" },
  "encolhimento com halteres": { maleFile: "EXERCÍCIOS COM HALTERES/TRAPÉZIO/Dumbbell-Shrug_Back-FIX__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1uZvW_-5BhBMgDLC86BhxMUvLUDcL6SFt&export=download&confirm=t" },
  "rosca direta com barra": { maleFile: "EXERCÍCIOS COM BARRAS/BICEPS/Barbell-Curl_Upper-Arms-FIX2__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1rl7woNEiGKv6tFmt01MR5VFjjKFB8e9N&export=download&confirm=t" },
  "rosca martelo": { maleFile: "EXERCÍCIOS COM HALTERES/BICEPS/Dumbbell-Alternate-Hammer-Srtict-Curl_Upper-Arms__converted.gif" },
  "rosca scott": { maleFile: "EXERCÍCIOS COM BARRAS/BICEPS/Barbell-Preacher-Curl_Upper-Arms_converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1c3FTQIri8otvYqzoDZLgKbx9LYWiAgEN&export=download&confirm=t" },
  "rosca concentrada": { maleFile: "EXERCÍCIOS COM HALTERES/BICEPS/Dumbbell-Concentration-Curl_Upper-Arms-FIX__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1XPrSOuVXvymdzsQxtLZ2oeesbIfRswNt&export=download&confirm=t" },
  "rosca na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/BICEPS/Cable-Curl-(male)_Upper-Arms-FIX__converted.gif" },
  "triceps na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/TRICEPS/Cable-Pushdown_Upper-Arms-FIX__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=13LYDVKuyYfcK9QRgQ81v-volkDohN6b_&export=download&confirm=t" },
  "triceps testa": { maleFile: "EXERCÍCIOS COM BARRAS/TRICEPS/Barbell-Lying-Triceps-Extension-Skull-Crusher_Upper-Arms_converted.gif" },
  "agachamento sumo": { maleFile: "EXERCÍCIOS COM BARRAS/PERNA/Barbell-sumo-squat_Thighs_converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1kRha3M7tDvdiHpgE6ZPB3mU2QHRlpBqa&export=download&confirm=t" },
  "agachamento bulgaro": { maleFile: "EXERCÍCIOS COM HALTERES/PERNA/Dumbbell-Bulgarian-Split-Squat-with-Support-(male)_converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1-GgjI3AlcYSkY6v59PvS-IgcWTUWjnqk&export=download&confirm=t" },
  "stiff com halteres": { maleFile: "EXERCÍCIOS COM HALTERES/PERNA/Dumbbell-Stiff-Leg-Deadlift_Hips_converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1nPGfstmqWEWOO0AjUdjZ-IsUh6TX-Aid&export=download&confirm=t" },
  "hip thrust": { maleFile: "EXERCÍCIOS COM BARRAS/PERNA/Barbell-Hip-Thrust_Hips-FIX__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1qzWAHHXJj32jPXQQt03KFZQELrL-pTUh&export=download&confirm=t" },
  "cadeira extensora": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Leg-Extension_Thighs_converted.gif" },
  "leg press 45°": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Sled-45-degrees-Leg-Press_Hips-FIX__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1Yq6sh731TA9h-coZG2s-QxXlAjFT4i-I&export=download&confirm=t" },
  "panturrilha sentada": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PANTURRILHA/Lever-Seated-Calf-Raise-(plate-loaded)_converted.gif" },
  "desenvolvimento na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/OMBRO/Lever-Seated-Shoulder-Press_Shoulders-FIX__converted.gif" },
  "elevacao lateral na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/OMBRO/Cable-Lateral-Raise_shoulder_converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1CyC5l7_Yul5vg5C2fePAGZvoMmL73R8Y&export=download&confirm=t" },
  "levantamento terra romeno": { maleFile: "EXERCÍCIOS COM BARRAS/PERNA/Barbell-Romanian-Deadlift_Hips-FIX__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1evvMOr_8_se0qGOKK2pcqnmh6XKw-TcM&export=download&confirm=t" },
  "leg press horizontal": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Horizontal-Leg-Press_Thighs__converted.gif" },
  "leg press vertical": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Vertical-Leg-Press-(male)_Thighs__converted.gif" },
  "agachamento no smith": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Smith-Squat_Hips__converted.gif" },
  "panturrilha no leg press": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PANTURRILHA/Sled-Calf-Press-On-Leg-Press_Calves-FIX__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1tPXzwX9JVQs_lI446QCE6jfJtCD_C0FB&export=download&confirm=t" },
  "supino declinado com barra": { maleFile: "EXERCÍCIOS COM BARRAS/PEITO/Barbell-Decline-Bench-Press_Chest-FIX__converted.gif" },
  "pullover com halter": { maleFile: "EXERCÍCIOS COM HALTERES/PEITO/Dumbbell-Pullover_Chest_converted.gif" },
  "supino reto na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PEITO/Lever-Chest-Press_Chest-FIX__converted.gif" },
  "supino inclinado na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PEITO/Lever-Incline-Chest-Press_Chest-FIX2__converted.gif" },
  "crucifixo na polia baixa": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/PEITO/Cable-Low-Fly_Chest-FIX2__converted.gif" },
  "flexao inclinada": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PEITO/Incline-Push-up-on-a-Smith-Bar-(male)_Chest__converted.gif" },
  "remada articulada": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/COSTAS/Lever-Seated-Row_Back_converted.gif" },
  "remada maquina com apoio": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/COSTAS/Lever-High-Row-(plate-loaded)_Back_converted.gif" },
  "graviton barra assistida": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/COSTAS/Assisted-Pull-up_Back_converted.gif" },
  "pullover na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PEITO/Lever-Pullover-(plate-loaded)_Back__converted.gif" },
  "elevacao lateral na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/OMBRO/Lever-Lateral-Raise_shoulder_converted.gif" },
  "crucifixo inverso": { maleFile: "EXERCÍCIOS COM HALTERES/TRAPÉZIO/Dumbbell-Rear-Delt-Raise_Shoulders_converted.gif" },
  "rosca biceps na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/BICEPS/Lever-Biceps-Curl_Upper-Arms__converted.gif" },
  "rosca inversa com barra": { maleFile: "EXERCÍCIOS COM BARRAS/ANTEBRAÇO/Barbell-Reverse-Curl_Forearm_converted.gif" },
  "extensao de punho": { maleFile: "EXERCÍCIOS COM BARRAS/ANTEBRAÇO/Barbell-Standing-Wrist-Reverse-Curl_Forearms__converted.gif" },
  "flexao de punho": { maleFile: "EXERCÍCIOS COM BARRAS/ANTEBRAÇO/Barbell-Palms-Down-Wrist-Curl-Over-A-Bench_Forearms_converted.gif" },
  "farmer walk": { maleFile: "EXERCÍCIOS COM HALTERES/PERNA/Farmers-walk_Cardio-FIX__converted.gif" },
  "triceps na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/TRICEPS/Lever-Triceps-Extension_Upper-Arms_converted.gif" },
  "triceps corda": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/TRICEPS/Cable-Pushdown-(with-rope-attachment)_Upper-Arms-FIX__converted.gif" },
  "mergulho no banco": { maleFile: "EXERCÍCIOS COM HALTERES/TRICEPS/Dumbbell-Bench-Dip_Upper-Arms__converted.gif" },
  "extensao de quadril na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Hip-Extension-(VERSION-2)_Hips__converted.gif" },
  "elevacao pelvica na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Hip-Thrust-(plate-loaded)-(male)_Hips__converted.gif" },
  "flexora em pe unilateral": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/PERNA/Cable-Standing-Leg-Curl_Thighs__converted.gif" },
  "bom dia com barra": { maleFile: "EXERCÍCIOS COM BARRAS/PERNA/Barbell-Good-Morning_Thighs-FIX__converted.gif" },
  "remada baixa": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/COSTAS/Cable-Seated-Row_Back-FIX__converted.gif" },
  "remada unilateral com halter": { maleFile: "EXERCÍCIOS COM HALTERES/COSTAS/Dumbbell-Bent-Over-Row_Back-FIX__converted.gif" },
  "rosca de punho": { maleFile: "EXERCÍCIOS COM BARRAS/ANTEBRAÇO/Barbell-Wrist-Curl-(VERSION-2)_Forearms-FIX2__converted.gif" },
  "mesa flexora": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Lying-Leg-Curl_Thighs-FIX__converted.gif" },
  "panturrilha em pe": { maleFile: "EXERCÍCIOS COM HALTERES/PANTURRILHAS/Dumbbell-Standing-Calf-Raise_Calves-FIX__converted.gif" },
  "remada cavalinho": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/COSTAS/Lever-Lying-T-bar-Row_Back_converted.gif" },
  "chest press articulado": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PEITO/Lever-Chest-Press_Chest-FIX__converted.gif" },
  "crucifixo com halteres": { maleFile: "EXERCÍCIOS COM HALTERES/PEITO/Hyght-Dumbbell-Fly_Chest__converted.gif" },
  "rosca scott na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/BICEPS/Lever-Preacher-Curl_Upper-Arms-FIX__converted.gif" },
  "rosca inclinada com halteres": { maleFile: "EXERCÍCIOS COM HALTERES/BICEPS/Dumbbell-Incline-Curl_Upper-Arms-FIX__converted.gif" },
  "panturrilha no smith": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PANTURRILHA/Smith-Calf-Raise-(version-2)_Calves-FIX__converted.gif" },
  "abdominal no banco declinado": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/ABDOMINAIS/Decline-Crunch_Waist_converted.gif" },
  "woodchopper na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/ABDOMINAIS/Cable-High-to-Low-Woodchopper-(male)_Waist__converted.gif" },
  "hiperextensao lombar": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/ABDOMINAIS/Lever-Back-Extension_Waist_converted.gif" },
  "remo ergometrico": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Rowing-(with-rowing-machine)_Cardio_converted.gif" },
  "eliptico": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Elliptical-Static-Walk_Cardio_converted.gif" },
  "puxada frontal": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/COSTAS/Cable-Lat-Pulldown-Full-Range-Of-Motion_Back__converted.gif" },
  "face pull": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/COSTAS/Cable-Standing-Face-Pull_Shoulders__converted.gif" },
  "elevacao frontal": { maleFile: "EXERCÍCIOS COM HALTERES/OMBRO/Dumbbell-One-Arm-Front-Raise_Shoulders__converted.gif" },
  "desenvolvimento militar com barra": { maleFile: "EXERCÍCIOS COM BARRAS/OMBROS/Barbell-Standing-Military-Press-(without-rack)_Shoulders_converted.gif" },
  "triceps coice": { maleFile: "EXERCÍCIOS COM HALTERES/TRICEPS/Dumbbell-Kickback_Upper-Arms_converted.gif" },
  "hack squat": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Sled-Hack-Squat_Hips_converted.gif" },
  "cadeira adutora": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Seated-Hip-Adduction_Thighs_converted.gif" },
  "cadeira abdutora": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Seated-Hip-Abduction_Hips-FIX__converted.gif" },
  "desenvolvimento com halteres": { maleFile: "EXERCÍCIOS COM HALTERES/OMBRO/Dumbbell-Alternate-Shoulder-Press-(male)_Shoulders_converted.gif" },
  "elevacao lateral": { maleFile: "EXERCÍCIOS COM HALTERES/OMBRO/Dumbbell-One-Arm-Lateral-Raise_Shoulder_converted.gif" },
  "rosca alternada com halteres": { maleFile: "EXERCÍCIOS COM HALTERES/BICEPS/Dumbbell-Alternate-Biceps-Curl_Upper-Arms-FIX__converted.gif" },
  "triceps frances": { maleFile: "EXERCÍCIOS COM HALTERES/TRICEPS/Dumbbell-Standing-French-Press_Upper-Arms__converted.gif" },
  "agachamento livre": { maleFile: "EXERCÍCIOS COM BARRAS/PERNA/Barbell-Full-Squat_Thighs-FIX__converted.gif" },
  "flexao de bracos": { maleFile: "EXERCÍCIOS COM HALTERES/PEITO/Deep-Push-Up_Chest_converted.gif" },
  "crossover na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/PEITO/Cable-Standing-Crossover-(male)_Chest__converted.gif" },
  "puxada neutra na maquina": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/COSTAS/Cable-Neutral-Grip-Lat-Pulldown-(male)_Back__converted.gif" },
  "puxada supinada": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/COSTAS/Cable-Underhand-Pulldown_Back_converted.gif" },
  "remada alta na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/TRAPÉZIO/Cable-Upright-Row_shoulder_converted.gif" },
  "desenvolvimento arnold": { maleFile: "EXERCÍCIOS COM HALTERES/PEITO/Dumbbell-Seated-Reverse-Arnold-Press-(male)_Should_converted.gif" },
  "cadeira flexora": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Seated-Leg-Curl_Thighs-FIX__converted.gif" },
  "gluteo na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/PERNA/Cable-Donkey-Kickback-(male)_Hips__converted.gif" },
  "abdominal na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/ABDOMINAIS/Cable-Kneeling-Crunch_Waist-FIX2__converted.gif" },
  "abdominal supra": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/ABDOMINAIS/Decline-Crunch_Waist_converted.gif" },
  "abdominal na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/ABDOMINAIS/Lever-Seated-Crunch_Waist_converted.gif" },
  "barra fixa": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/COSTAS/Pull-up_Back-FIX2__converted.gif" },
  "mergulho nas paralelas": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/TRICEPS/Chest-Dip_Chest_converted.gif" },
  "abdominal infra": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/ABDOMINAIS/Decline-Bent-Leg-Reverse-Crunch_Waist_converted.gif" },
  "elevacao de pernas": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/ABDOMINAIS/Hanging-Straight-Leg-Raise_Hips-FIX__converted.gif" },
  "alongamento de dorsais": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/COSTAS/Hangback-Bar-Stretch_Stretching__converted.gif" },
  "crucifixo na polia alta": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/PEITO/Cable-Kneeling-High-to-Low-Fly-(male)_Chest__converted.gif" },
  "crucifixo inverso na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/COSTAS/Lever-Seated-Reverse-Fly_Shoulders-FIX__converted.gif" },
  "rotacao externa na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/COSTAS/Cable-Standing-Shoulder-External-Rotation_Back-FIX_converted.gif" },
  "triceps unilateral na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/TRICEPS/Cable-One-Arm-Tricep-Pushdown_Upper-Arms__converted.gif" },
  "passada no smith": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Smith-Rear-Lunge-(version-2)-(male)_Thighs__converted.gif" },
  "coice na maquina": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/PERNA/Lever-Standing-Rear-Kick_Hips_converted.gif" },
  "afundo com halteres": { maleFile: "EXERCÍCIOS COM HALTERES/PERNA/Dumbbell-Lunge_Hips-FIX2__converted.gif" },
  "levantamento terra com barra": { maleFile: "EXERCÍCIOS COM BARRAS/PERNA/Barbell-Deadlift_Hips-FIX_converted.gif" },
  "levantamento terra sumo com barra": { maleFile: "EXERCÍCIOS COM BARRAS/PERNA/Barbell-Sumo-Deadlift_Hips-FIX__converted.gif" },
  "agachamento frontal com barra": { maleFile: "EXERCÍCIOS COM BARRAS/PERNA/Barbell-Front-Squat_Hips-FIX__converted.gif" },
  "agachamento goblet com halter": { maleFile: "EXERCÍCIOS COM HALTERES/PERNA/Dumbbell-Goblet-Squat_Thighs-FIX__converted.gif" },
  "step-up com halteres": { maleFile: "EXERCÍCIOS COM HALTERES/PERNA/Dumbbell-Step-up_Hips__converted.gif" },
  "puxada unilateral na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/COSTAS/Cable-One-Arm-Pulldown_Back__converted.gif" },
  "remada alta com barra": { maleFile: "EXERCÍCIOS COM BARRAS/OMBROS/Barbell-Upright-Row_shoulder_converted.gif" },
  "supino fechado com barra": { maleFile: "EXERCÍCIOS COM BARRAS/PEITO/Barbell-Close-Grip-Bench-Press_Upper-Arms-FIX__converted.gif" },
  "triceps acima da cabeca na polia": { maleFile: "EXERCÍCIOS NO CABO  OU POLIA/TRICEPS/Cable-Overhead-Triceps-Extension-(rope-attachment)_Upper-Arms-FIX__converted.gif" },
  "agachamento com peso corporal": { maleFile: "FUNCIONAL/PESO CORPORAL/PERNA/Bodyweight-Squat-(male)_Thighs-FRONT-POV__converted.gif" },
  "avanco com peso corporal": { maleFile: "FUNCIONAL/PESO CORPORAL/PERNA/Bodyweight-Forward-Lunge-(Smaller-Stance-Upright-Torso)_Thighs__converted.gif" },
  "alongamento de peitoral": { maleFile: "FUNCIONAL/ALONGAMENTO/Dynamic-Chest-Stretch-(male)_Chest_converted.gif" },
  "alongamento de quadriceps": { maleFile: "FUNCIONAL/ALONGAMENTO/Double-Lean-Back-Quadriceps-Stretch_Thighs__converted.gif" },
  "mobilidade de quadril": { maleFile: "FUNCIONAL/MOBILIDADE/QUADRIL/Full-Squat-Mobility_Thighs__converted.gif" },
  "bicicleta ergometrica": { maleFile: "FUNCIONAL/CARDIO/Stationary-Bike-Run-(version-4)_Cardio_converted.gif" },
  "esteira": { maleFile: "FUNCIONAL/CARDIO/Walking-on-Treadmill_Cardio_converted.gif" },
  "abdominal obliquo": { maleFile: "FUNCIONAL/ABDOMINAIS/Alternate-Oblique-Crunch_Waist__converted.gif" },
  "burpee": { maleFile: "FUNCIONAL/PESO CORPORAL/BURPEE/Burpee_Cardio-FIX__converted.gif" },
  "corda naval": { maleFile: "FUNCIONAL/CORDA NAVAL/Battling-Ropes_converted.gif" },
  "escada ergometrica": { maleFile: "FUNCIONAL/CARDIO/Walking-on-Stepmill_Cardio_converted.gif" },
  "mobilidade de ombros": { maleFile: "FUNCIONAL/MOBILIDADE/OMBRO/Arm-Circles_Shoulders_converted.gif" },
  "mobilidade de tornozelo": { maleFile: "FUNCIONAL/MOBILIDADE/TORNOZELO/Ankle-Circles_Calves__converted.gif" },
  "alongamento de posteriores": { maleFile: "FUNCIONAL/MOBILIDADE/QUADRIL/Low-Lunge-to-Hamstring-Stretch-(male)_Stretching__converted.gif" },
  "alongamento de panturrilha": { maleFile: "FUNCIONAL/ALONGAMENTO/Crouching-Heel-Back-Calf-Stretch_Calves__converted.gif" },
  "gluteo quatro apoios": { maleFile: "FUNCIONAL/PESO CORPORAL/PERNA/Bent-Leg-Kickback-(kneeling)-(male)_Hips-FIX__converted.gif" },
  "air bike": { maleFile: "FUNCIONAL/CARDIO/Assault-Bike-Run_Cardio__converted.gif" },
  "prancha abdominal": { maleFile: "KETTLEBELL/ABDOMINAIS/Kettlebell-Plank-Pass-Through_Waist__converted.gif", match: "equivalent" },
  "prancha lateral": { maleFile: "KETTLEBELL/ABDOMINAIS/Kettlebell-Side-Plank-(male)_Waist__converted.gif", match: "equivalent" },
  "flexao declinada": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/TRICEPS/Decline-Diamond-Push-up_Chest__converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1aa0qvtjRk_N8BnxE44AhjZv3YGqgohih&export=download&confirm=t", match: "equivalent" },
  "elevacao frontal com anilha": { maleFile: "EXERCÍCIOS COM BARRAS/OMBROS/Barbell-Front-Raise_Shoulders_converted.gif", femaleUrl: "https://drive.usercontent.google.com/download?id=1bWrqGQJxOzw8AYG3UcTUU_8wO1atsGsi&export=download&confirm=t", match: "equivalent" },
  "rosca 21": { maleFile: "EXERCÍCIOS COM BARRAS/BICEPS/Barbell-Curl_Upper-Arms-FIX2__converted.gif", match: "equivalent" },
  "abdominal remador": { maleFile: "EXERCÍCIOS NA MAQUINA - HACK - BANCO/ABDOMINAIS/Vertical-Sit-Up-(male)_Waist__converted.gif", match: "equivalent" },
};

function exerciseGifKey(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function packagedGifUrl(file: string) {
  if (typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname)) return "";
  return `/exercise-gifs/${file.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

function verifiedExerciseGif(name: string, profile: "masculino" | "feminino" = "masculino") {
  const key = exerciseGifKey(name);
  const gif = verifiedExerciseGifs[key];
  if (!gif) return "";
  return profile === "feminino" ? (verifiedFemaleGifUrls[key] || gif.femaleUrl || packagedGifUrl(gif.maleFile)) : packagedGifUrl(gif.maleFile);
}

function exerciseGifSource(exercise: Pick<ExerciseRecord, "name" | "gifUrl" | "gifMaleUrl" | "gifFemaleUrl">, profile: "masculino" | "feminino" = "masculino") {
  const saved = profile === "feminino" ? (exercise.gifFemaleUrl || exercise.gifUrl) : (exercise.gifMaleUrl || exercise.gifUrl);
  return saved || verifiedExerciseGif(exercise.name, profile);
}

function machineCode(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function equipmentForExercise(name: string) {
  const normalized = name.toLocaleLowerCase("pt-BR");
  if (normalized.includes("smith")) return "Máquina Smith";
  if (normalized.includes("polia")) return "Estação de polias";
  if (normalized.includes("leg press 45")) return "Leg press 45°";
  if (normalized.includes("leg press horizontal")) return "Leg press horizontal";
  if (normalized.includes("leg press vertical")) return "Leg press vertical";
  if (normalized.includes("hack squat")) return "Máquina Hack squat";
  if (normalized.includes("graviton")) return "Máquina Graviton";
  if (normalized.includes("cadeira extensora")) return "Cadeira extensora";
  if (normalized.includes("cadeira flexora")) return "Cadeira flexora";
  if (normalized.includes("cadeira adutora")) return "Cadeira adutora";
  if (normalized.includes("cadeira abdutora")) return "Cadeira abdutora";
  if (normalized.includes("mesa flexora")) return "Mesa flexora";
  if (normalized.includes("máquina") || normalized.includes("articulad")) return name.replace(/^(rosca bíceps|rosca scott|supino reto|supino inclinado|desenvolvimento|tríceps|pullover|remada)\s+(na|no)\s+/i, "Máquina de ");
  if (normalized.includes("halter")) return "Halteres";
  if (normalized.includes("barra")) return "Barra livre e anilhas";
  if (normalized.includes("esteira")) return "Esteira ergométrica";
  if (normalized.includes("bicicleta")) return "Bicicleta ergométrica";
  if (normalized.includes("elíptico")) return "Elíptico";
  if (normalized.includes("remo ergométrico")) return "Remo ergométrico";
  if (normalized.includes("escada ergométrica")) return "Escada ergométrica";
  if (normalized.includes("air bike")) return "Air bike";
  if (normalized.includes("corda naval")) return "Corda naval";
  if (normalized.includes("banco")) return "Banco de exercícios";
  return "Área livre / peso corporal";
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
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
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

  useEffect(() => {
    setActiveWorkoutId(window.sessionStorage.getItem(workoutInProgressKey(access.academyId, access.userId)));
  }, [access.academyId, access.userId]);

  function announce(message: string) {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 2600);
  }

  function startStudentWorkout(workout?: WorkoutRecord) {
    setActiveWorkout(workout ?? null);
    setActiveWorkoutId(workout?.id ?? null);
    setCompletedSets([]);
    if (workout) window.sessionStorage.setItem(workoutInProgressKey(access.academyId, access.userId), workout.id);
    setSessionOpen(true);
  }

  function finishStudentWorkout() {
    window.sessionStorage.removeItem(workoutInProgressKey(access.academyId, access.userId));
    setActiveWorkoutId(null);
    setActiveWorkout(null);
    setSessionOpen(false);
  }

  return (
    <FeedbackContext.Provider value={announce}>
      <main
        className={role === "aluno" ? "v3-page" : "v3-page desktop-mode"}
        data-theme={theme === "prata" ? "ferro" : "forja"}
      >
        {canSwitchRole && !sessionOpen && (
          <RoleSwitcher role={demoRole} onChange={(nextRole) => { setDemoRole(nextRole); setSessionOpen(false); setMenuOpen(false); }} />
        )}
        {role === "aluno" && (
        <section className={sessionOpen ? "student-app session-active" : "student-app"}>
          <BirthdayGreeting />
          {sessionOpen ? (
            <WorkoutSession
              workout={activeWorkout ?? undefined}
              completedSets={completedSets}
              onBack={() => setSessionOpen(false)}
              onCompleted={finishStudentWorkout}
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
                {activeTab === "inicio" && <StudentHome onStart={startStudentWorkout} onEvolution={() => setActiveTab("evolucao")} onViewWorkouts={() => setActiveTab("treinos")} />}
                {activeTab === "treinos" && <WorkoutLibrary activeWorkoutId={activeWorkout?.id ?? activeWorkoutId} onStart={startStudentWorkout} />}
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
        <AppGuide role={role} />
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

function normalizeTemplateForStudent(template: WorkoutTemplateRecord, studentId: string, studentName: string): WorkoutRecord {
  return { id: `general-template-${template.id}`, name: template.name, studentId, studentName, recommendedDay: template.scheduleDay, level: template.level, audience: template.audience, exerciseIds: template.exerciseIds ?? [], exerciseDetails: template.exerciseDetails ?? [], status: "published" };
}

function useStudentPublishedWorkouts(enabled = true) {
  const access = useAccess();
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(db));
  const [previewStudent, setPreviewStudent] = useState<{ id: string; userId?: string | null; name: string } | null>(null);

  useEffect(() => {
    if (!db || access.role === "student") {
      setPreviewStudent(null);
      return;
    }
    return onSnapshot(query(collection(db, "academies", access.academyId, "students"), where("active", "==", true)), (snapshot) => {
      const first = snapshot.docs[0];
      if (!first) { setPreviewStudent(null); return; }
      const data = first.data() as { name?: string; userId?: string | null; authUid?: string | null; uid?: string | null };
      setPreviewStudent({ id: first.id, userId: data.userId ?? data.authUid ?? data.uid ?? first.id, name: data.name ?? "Aluno" });
    }, () => setPreviewStudent(null));
  }, [access.academyId, access.role]);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    if (!db) {
      const syncLocalWorkouts = () => {
        const studentId = localStudentId(access.academyId, access.userId);
        const studentName = accountName(access.user.displayName, access.user.email);
        const assigned = readLocalCollection<WorkoutRecord>(access.academyId, "workouts").filter((item) => (item.studentId === studentId || item.studentRecordId === studentId || item.studentUserId === access.userId) && item.status === "published");
        const availableTemplates = readLocalCollection<WorkoutTemplateRecord>(access.academyId, "workoutTemplates").filter((item) => (item.audience ?? "Geral") === "Geral" || (item.audience === "Personalizado" && item.targetStudentId === studentId)).map((item) => normalizeTemplateForStudent(item, studentId, studentName));
        setWorkouts([...assigned, ...availableTemplates]);
        setLoading(false);
      };
      syncLocalWorkouts();
      window.addEventListener("orquestra-fit:collection-updated", syncLocalWorkouts);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocalWorkouts);
    }
    const previewingStudent = access.role !== "student" && Boolean(previewStudent);
    const targetStudentId = previewStudent?.userId ?? previewStudent?.id ?? access.userId;
    const targetStudentName = previewStudent?.name ?? accountName(access.user.displayName, access.user.email);
    setLoading(true);
    const workoutsQuery = previewingStudent
      ? query(collection(db, "academies", access.academyId, "workouts"), where("status", "==", "published"))
      : query(collection(db, "academies", access.academyId, "workouts"), where("studentId", "==", access.userId), where("status", "==", "published"));
    const workoutsByUserQuery = previewingStudent ? null : query(collection(db, "academies", access.academyId, "workouts"), where("studentUserId", "==", access.userId));
    const generalTemplatesQuery = query(collection(db, "academies", access.academyId, "workoutTemplates"), where("audience", "==", "Geral"));
    const personalizedTemplatesQuery = query(collection(db, "academies", access.academyId, "workoutTemplates"), where("targetStudentId", "==", targetStudentId));
    let assignedWorkouts: WorkoutRecord[] = [];
    let assignedWorkoutsByUser: WorkoutRecord[] = [];
    let generalWorkouts: WorkoutRecord[] = [];
    let personalizedWorkouts: WorkoutRecord[] = [];
    const publishWorkouts = () => {
      const uniqueAssigned = [...assignedWorkouts, ...assignedWorkoutsByUser].filter((workout, index, list) => list.findIndex((item) => item.id === workout.id) === index);
      setWorkouts([...uniqueAssigned, ...generalWorkouts, ...personalizedWorkouts].filter((workout, index, list) => list.findIndex((item) => item.id === workout.id) === index));
    };
    const unsubscribeWorkouts = onSnapshot(workoutsQuery, (snapshot) => {
      assignedWorkouts = snapshot.docs.filter((workout) => !previewingStudent || [targetStudentId, previewStudent?.id].includes(workout.data().studentId) || [targetStudentId, previewStudent?.id].includes(workout.data().studentUserId) || [targetStudentId, previewStudent?.id].includes(workout.data().studentRecordId)).map((workout) => normalizePublishedWorkout(workout.id, workout.data() as Omit<WorkoutRecord, "id">));
      publishWorkouts();
      setLoading(false);
    }, (error) => {
      console.error("Não foi possível carregar os treinos.", error);
      setLoading(false);
    });
    const unsubscribeWorkoutsByUser = workoutsByUserQuery ? onSnapshot(workoutsByUserQuery, (snapshot) => {
      assignedWorkoutsByUser = snapshot.docs.filter((workout) => workout.data().status === "published").map((workout) => normalizePublishedWorkout(workout.id, workout.data() as Omit<WorkoutRecord, "id">));
      publishWorkouts();
      setLoading(false);
    }, (error) => {
      // A consulta é um índice de compatibilidade para fichas antigas. A consulta principal continua funcionando mesmo sem esse campo.
      console.warn("Não foi possível consultar o vínculo alternativo do treino.", error);
    }) : () => undefined;
    const unsubscribeGeneralTemplates = onSnapshot(generalTemplatesQuery, (snapshot) => {
      generalWorkouts = snapshot.docs.map((template) => normalizeTemplateForStudent({ id: template.id, ...(template.data() as Omit<WorkoutTemplateRecord, "id">), exerciseIds: (template.data().exerciseIds as string[] | undefined) ?? [], exerciseDetails: (template.data().exerciseDetails as WorkoutExerciseDetail[] | undefined) ?? [] }, targetStudentId, targetStudentName));
      publishWorkouts();
      setLoading(false);
    }, (error) => {
      console.error("Não foi possível carregar os programas gerais.", error);
      setLoading(false);
    });
    const unsubscribePersonalizedTemplates = onSnapshot(personalizedTemplatesQuery, (snapshot) => {
      personalizedWorkouts = snapshot.docs.filter((template) => (template.data().audience as string | undefined) === "Personalizado").map((template) => normalizeTemplateForStudent({ id: template.id, ...(template.data() as Omit<WorkoutTemplateRecord, "id">), exerciseIds: (template.data().exerciseIds as string[] | undefined) ?? [], exerciseDetails: (template.data().exerciseDetails as WorkoutExerciseDetail[] | undefined) ?? [] }, targetStudentId, targetStudentName));
      publishWorkouts();
      setLoading(false);
    }, (error) => {
      console.error("Não foi possível carregar o programa personalizado.", error);
      setLoading(false);
    });
    return () => { unsubscribeWorkouts(); unsubscribeWorkoutsByUser(); unsubscribeGeneralTemplates(); unsubscribePersonalizedTemplates(); };
  }, [access.academyId, access.role, access.userId, enabled, previewStudent]);

  return { workouts, loading };
}

function useStudentWorkoutExecutions() {
  const access = useAccess();
  const [executions, setExecutions] = useState<WorkoutExecution[]>([]);
  useEffect(() => {
    if (!db) {
      const syncLocal = () => {
        const studentId = localStudentId(access.academyId, access.userId);
        setExecutions(readLocalCollection<WorkoutExecution>(access.academyId, "workoutExecutions").filter((item) => item.studentId === studentId).sort((a, b) => workoutExecutionTime(b.completedAt) - workoutExecutionTime(a.completedAt)));
      };
      syncLocal();
      window.addEventListener("orquestra-fit:collection-updated", syncLocal);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocal);
    }
    return onSnapshot(query(collection(db, "academies", access.academyId, "workoutExecutions"), where("studentId", "==", access.userId)), (snapshot) => setExecutions(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<WorkoutExecution, "id">) })).sort((a, b) => workoutExecutionTime(b.completedAt) - workoutExecutionTime(a.completedAt))));
  }, [access.academyId, access.userId]);
  return executions;
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

function printWorkoutSheet(workout: WorkoutRecord, audienceLabel = "ALUNO") {
  const printWindow = window.open("", "_blank", "width=900,height=720");
  if (!printWindow) return;
  const exercises = workout.exerciseDetails ?? [];
  const exerciseRows = exercises.length > 0
    ? exercises.map((exercise, index) => { const metrics = exerciseMetricLabels(exercise); const reps = exercise.reps ? `${exercise.reps} ${metrics.repsUnit}` : "—"; const load = exercise.load ? `${exercise.load}${metrics.loadUnit ? ` ${metrics.loadUnit}` : ""}` : "—"; return `<tr><td><b>${index + 1}. ${escapePrintText(exercise.name)}</b>${exercise.muscleGroup ? `<small>${escapePrintText(exercise.muscleGroup)}</small>` : ""}${exercise.instructions ? `<small>${escapePrintText(exercise.instructions)}</small>` : ""}</td><td>${escapePrintText(exercise.sets)}</td><td>${escapePrintText(reps)}</td><td>${escapePrintText(load)}</td><td>${escapePrintText(exercise.rest)}s</td></tr>`; }).join("")
    : `<tr><td colspan="5">Exercícios vinculados: ${workout.exerciseIds.length}</td></tr>`;
  const printedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());
  const primaryMetrics = exerciseMetricLabels(exercises[0] ?? { name: "", exerciseType: "Força", equipmentName: "", muscleGroup: "" });
  printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapePrintText(workout.name)} - ${escapePrintText(workout.studentName)}</title><style>@page{margin:5mm}*{box-sizing:border-box}body{margin:0 auto;max-width:190mm;color:#111;background:#fff;font-family:Arial,sans-serif;font-size:10pt}header{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}header strong{display:block;font-family:Georgia,serif;font-size:16pt}header span{display:block;font-size:8pt;letter-spacing:.18em;margin-top:2px}h1{font-family:Georgia,serif;font-size:15pt;margin:0 0 3px}.student{margin:0 0 12px;font-size:9pt}.student b{display:block;font-size:11pt}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border-bottom:1px solid #bbb;padding:6px 3px;text-align:center;vertical-align:top}th{font-size:7.5pt;text-transform:uppercase}th:first-child,td:first-child{text-align:left;width:48%}td b,td small{display:block}td small{font-size:7.5pt;line-height:1.3;margin-top:2px;color:#333}footer{margin-top:12px;padding-top:8px;border-top:1px dashed #777;text-align:center;font-size:7.5pt}.no-print{display:block;width:100%;margin:16px 0;padding:10px;border:0;background:#111;color:#fff;font-weight:bold}@media print{.no-print{display:none}}@media(max-width:90mm){body{font-size:8pt}header strong{font-size:13pt}h1{font-size:12pt}th,td{padding:4px 2px}th:first-child,td:first-child{width:44%}}</style></head><body><header><strong>DAMA DE FERRO</strong><span>ACADEMIA · ORQUESTRA FIT</span></header><main><h1>${escapePrintText(workout.name)}</h1><p class="student"><span>${escapePrintText(audienceLabel)}</span><b>${escapePrintText(workout.studentName)}</b></p><table><thead><tr><th>Exercício</th><th>${escapePrintText(primaryMetrics.sets)}</th><th>${escapePrintText(primaryMetrics.reps)}</th><th>${escapePrintText(primaryMetrics.load)}</th><th>${escapePrintText(primaryMetrics.rest)}</th></tr></thead><tbody>${exerciseRows}</tbody></table></main><footer>Impresso em ${escapePrintText(printedAt)} · Tempos, velocidades e cargas podem ser ajustados pelo professor.</footer><button class="no-print" onclick="window.print()">Imprimir treino</button></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

function printWorkoutTemplate(template: WorkoutTemplateRecord) {
  printWorkoutSheet({
    id: template.id,
    name: template.name,
    studentId: "",
    studentName: `Programa reutilizável · ${template.level ?? "Fundação"}`,
    exerciseIds: template.exerciseIds,
    exerciseDetails: template.exerciseDetails,
    status: "draft",
  }, "PROGRAMA-BASE");
}

function StudentHome({ onStart, onEvolution, onViewWorkouts }: { onStart: (workout?: WorkoutRecord) => void; onEvolution: () => void; onViewWorkouts: () => void }) {
  const access = useAccess();
  const { workouts, loading } = useStudentPublishedWorkouts();
  const workout = workouts[0];
  const exerciseCount = workout?.exerciseDetails?.length || workout?.exerciseIds.length || 0;
  const totalSets = workout?.exerciseDetails?.reduce((total, exercise) => total + (Number(exercise.sets) || 0), 0) ?? 0;
  return (
    <div className="student-view home-view">
      <section className="welcome-row">
        <div><p>{brazilLongDate()}</p><h1>{brazilGreeting()}, {firstName(access.user.displayName, access.user.email)}.</h1><span>Seu ritmo começa aqui.</span></div>
        <div className="streak" aria-label="Sequência de treinos"><Flame size={20} /><strong>—</strong><small>sem histórico</small></div>
      </section>

      <article className="today-workout">
        <div className="workout-copy">
          <div className="eyebrow"><span /> TREINO DE HOJE</div>
          <h2>{loading ? "Carregando seu treino" : workout?.name ?? "Nenhum treino publicado"}</h2>
          <p>{loading ? "Buscando suas fichas disponíveis." : workout ? `Ficha publicada para você com ${exerciseCount} ${exerciseCount === 1 ? "exercício" : "exercícios"}. ${workout.recommendedDay && workout.recommendedDay !== "Flexível" ? `Indicado para ${workout.recommendedDay.toLocaleLowerCase("pt-BR")}, mas você pode escolher qualquer treino.` : "Você pode escolher qualquer treino disponível."}` : "Seu professor ainda não publicou um treino."}</p>
          <div className="workout-meta">
            <span><Clock3 size={16} /> {workout ? `${totalSets || "—"} séries` : "Aguardando"}</span>
            <span><Dumbbell size={16} /> {workout ? `${exerciseCount} exercícios` : "Sem exercícios"}</span>
          </div>
          <div className="student-workout-actions"><button disabled={loading || !workout} onClick={() => workout && onStart(workout)}>{loading ? "Carregando..." : workout ? "Iniciar treino" : "Treino indisponível"} <ArrowRight size={19} /></button><button className="workout-secondary-action" type="button" onClick={onViewWorkouts}><Dumbbell size={17} /> Ver treinos</button></div>
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
      <AcademyHoursCard />
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

const academyWeekdayLabels: Record<string, string> = { monday: "Segunda", tuesday: "Terça", wednesday: "Quarta", thursday: "Quinta", friday: "Sexta", saturday: "Sábado", sunday: "Domingo" };

function AcademyHoursCard() {
  const access = useAccess();
  const [settings, setSettings] = useState({ openingDays: Object.keys(academyWeekdayLabels), openingTime: "06:00", closingTime: "22:00" });
  useEffect(() => {
    function apply(data: { openingDays?: unknown; openingTime?: string; closingTime?: string } | null | undefined) {
      const openingDays = Array.isArray(data?.openingDays) ? data.openingDays.filter((item): item is string => typeof item === "string") : [];
      setSettings({ openingDays: openingDays.length ? openingDays : Object.keys(academyWeekdayLabels), openingTime: data?.openingTime || "06:00", closingTime: data?.closingTime || "22:00" });
    }
    if (!db) {
      const syncLocal = () => {
        try { apply(JSON.parse(window.localStorage.getItem(`orquestra-fit:${access.academyId}:academy-settings`) ?? "null") as { openingDays?: unknown; openingTime?: string; closingTime?: string } | null); } catch { apply(null); }
      };
      syncLocal();
      window.addEventListener("orquestra-fit:collection-updated", syncLocal);
      return () => window.removeEventListener("orquestra-fit:collection-updated", syncLocal);
    }
    return onSnapshot(doc(db, "academies", access.academyId), (snapshot) => apply(snapshot.data() as { openingDays?: unknown; openingTime?: string; closingTime?: string } | undefined));
  }, [access.academyId]);
  return <article className="academy-hours-card"><div className="academy-hours-card-mark"><Clock3 size={18} /></div><div><small>FUNCIONAMENTO DA ACADEMIA</small><strong>{settings.openingTime} – {settings.closingTime}</strong><p>{settings.openingDays.map((day) => academyWeekdayLabels[day]).filter(Boolean).join(" · ")}</p></div></article>;
}

function WorkoutLibrary({ onStart, activeWorkoutId }: { onStart: (workout?: WorkoutRecord) => void; activeWorkoutId?: string | null }) {
  const { workouts: publishedWorkouts, loading } = useStudentPublishedWorkouts();
  const executions = useStudentWorkoutExecutions();
  function workoutHistory(workoutId: string) { return executions.filter((execution) => execution.workoutId === workoutId).sort((a, b) => workoutExecutionTime(b.completedAt) - workoutExecutionTime(a.completedAt)); }
  return (
    <div className="student-view">
      <PageIntro kicker="PROGRAMA ATUAL" title="Seus treinos" copy="Um plano construído para evoluir com consistência." />
      <div className="program-summary">
        <div><small>Ciclo</small><strong>Nenhum ciclo ativo</strong></div><span>AGUARDANDO</span>
        <div className="program-line"><i /></div>
      </div>
      <div className="workout-state-legend" aria-label="Legenda dos estados dos treinos">
        <span className="legend-in-progress"><i /> Em andamento</span>
        <span className="legend-completed"><i /> Concluído</span>
        <span className="legend-next"><i /> Próximo</span>
      </div>
      <div className="workout-list">
        {publishedWorkouts.length > 0 ? publishedWorkouts.map((workout, index) => (
          (() => {
            const history = workoutHistory(workout.id);
            const latest = history[0];
            const previous = history[1];
            const isInProgress = activeWorkoutId === workout.id;
            const isCompleted = Boolean(latest) && !isInProgress;
            const stateClass = isInProgress ? "is-in-progress" : isCompleted ? "is-completed" : "is-next";
            const stateLabel = isCompleted ? "TREINO CONCLUÍDO" : isInProgress ? "TREINO EM EXECUÇÃO" : index === 0 ? "PRÓXIMO TREINO" : "TREINO PROGRAMADO";
            const workoutCode = String.fromCharCode(65 + (index % 26));
            const recommendedDay = workout.recommendedDay && workout.recommendedDay !== "Flexível" ? workout.recommendedDay : null;
            const durationDelta = previous ? latest.durationSeconds - previous.durationSeconds : null;
            const stars = latest ? previous ? Math.max(1, Math.min(5, 3 + (durationDelta !== null && durationDelta <= 0 ? 1 : 0) + ((latest.maxLoad ?? 0) > (previous.maxLoad ?? 0) || (latest.maxReps ?? 0) > (previous.maxReps ?? 0) ? 1 : 0))) : 1 : 0;
            return <article key={workout.id} className={`workout-library-card ${stateClass}`}>
            <button className="workout-open" type="button" onClick={() => onStart(workout)}><span className="workout-index">{isCompleted ? <Check size={17} /> : workoutCode}</span><div><small>{stateLabel} · TREINO {workoutCode}{recommendedDay ? ` · ${recommendedDay}` : ""}</small><strong>{workout.name}</strong><p>{workout.exerciseIds.length} exercícios{latest ? ` · ${formatWorkoutDuration(latest.durationSeconds)} na última vez` : ""}</p></div><span className="play-button">{isCompleted ? <Check size={18} /> : <Play size={18} fill="currentColor" />}</span></button>
            {latest && <div className="workout-card-progress"><span aria-label={`${stars} de 5 estrelas`}>{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span><small>{previous && durationDelta !== null ? durationDelta === 0 ? "Mesmo tempo da última vez" : `${durationDelta > 0 ? "+" : "−"}${formatWorkoutDuration(Math.abs(durationDelta))} comparado ao treino anterior` : "Primeiro resultado salvo"}</small></div>}
            <button className="workout-print" type="button" onClick={() => printWorkoutSheet(workout)}><Printer size={16} /> Imprimir</button>
          </article>;
          })()
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
       setExecutions(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<WorkoutExecution, "id">) })).sort((a, b) => workoutExecutionTime(b.completedAt) - workoutExecutionTime(a.completedAt)));
    }, (error) => console.error("Não foi possível carregar o histórico de treinos.", error));
    return () => { unsubscribeAssessments(); unsubscribeExecutions(); };
  }, [access.academyId, access.userId]);
  const latestAssessment = assessments[0] ?? null;
  const previousAssessment = assessments[1] ?? null;
  const totalWorkoutSeconds = executions.reduce((total, item) => total + (item.durationSeconds || 0), 0);
  const totalWorkoutCalories = executions.reduce((total, item) => total + (item.calories || Math.round((item.durationSeconds || 0) / 60 * 5.5)), 0);
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
        <article><Clock3 /><small>Tempo acumulado</small><strong>{formatWorkoutDuration(totalWorkoutSeconds)}</strong><p>Somado nas execuções salvas</p></article>
        <article><Flame /><small>Calorias estimadas</small><strong>{totalWorkoutCalories || "—"}</strong><p>Estimativa baseada no tempo de treino</p></article>
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
        <div className="section-heading"><div><span>DESEMPENHO</span><h2>Suas melhores cargas</h2><p>Mostra o maior peso registrado em cada exercício concluído.</p></div></div>
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

type SessionExercise = Omit<WorkoutExerciseDetail, "exerciseId" | "sets" | "rest"> & { group: string; sets: number; rest: string; metricMode?: ExerciseMetricMode };

function normalizeMachineQr(rawValue: string) {
  const value = rawValue.trim();
  try {
    const url = new URL(value);
    const code = url.searchParams.get("machine") || url.searchParams.get("maquina");
    if (code) return machineCode(code);
  } catch { /* O QR pode conter apenas o código interno. */ }
  return machineCode(value.replace(/^OF[|:/-]+/i, "").split("|").at(-1) || value);
}

function MachineQrReader({ exercises, onClose, onSelect }: { exercises: SessionExercise[]; onClose: () => void; onSelect: (index: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ stop: () => void; destroy: () => void } | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [scannedCode, setScannedCode] = useState("");
  const [cameraError, setCameraError] = useState("");
  const compatible = useMemo(() => exercises.map((exercise, index) => ({ exercise, index })).filter(({ exercise }) => {
    const code = exercise.machineCode || machineCode(exercise.equipmentName || equipmentForExercise(exercise.name));
    return scannedCode && code === scannedCode;
  }), [exercises, scannedCode]);

  useEffect(() => {
    let disposed = false;
    async function startScanner() {
      if (!videoRef.current) return;
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (disposed || !videoRef.current) return;
        const scanner = new QrScanner(videoRef.current, (result) => setScannedCode(normalizeMachineQr(typeof result === "string" ? result : result.data)), {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        });
        scannerRef.current = scanner;
        await scanner.start();
      } catch {
        setCameraError("Não foi possível abrir a câmera. Digite o código impresso abaixo do QR.");
      }
    }
    void startScanner();
    return () => {
      disposed = true;
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
    };
  }, []);

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    if (manualCode.trim()) setScannedCode(normalizeMachineQr(manualCode));
  }

  return <div className="machine-reader-backdrop" role="dialog" aria-modal="true" aria-label="Leitor de QR da máquina">
    <section className="machine-reader">
      <header><div><small>ESTAÇÃO INTELIGENTE</small><h2>Qual é esta máquina?</h2></div><button type="button" aria-label="Fechar leitor" onClick={onClose}><X /></button></header>
      {!scannedCode && <><div className="machine-camera"><video ref={videoRef} muted playsInline /><span><QrCode /> Aponte para o QR da máquina</span></div>{cameraError && <p className="machine-camera-error">{cameraError}</p>}</>}
      <form className="machine-code-form" onSubmit={submitManual}><label>Código da máquina<input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Ex.: leg-press-45" /></label><button type="submit">Consultar</button></form>
      {scannedCode && <div className="machine-result"><small>MÁQUINA IDENTIFICADA</small><h3>{compatible[0]?.exercise.equipmentName || scannedCode.replace(/-/g, " ")}</h3>{compatible.length ? <><p>Exercícios disponíveis no seu treino:</p>{compatible.map(({ exercise, index }) => <button type="button" key={`${exercise.name}-${index}`} onClick={() => onSelect(index)}><Dumbbell /><span><strong>{exercise.name}</strong><small>{exercise.sets} séries · {exercise.reps} repetições</small></span><ChevronRight /></button>)}</> : <p>Nenhum exercício do seu treino atual usa esta máquina.</p>}<button className="machine-scan-again" type="button" onClick={() => setScannedCode("")}>Ler outro QR</button></div>}
    </section>
  </div>;
}

function WorkoutSession({ workout, completedSets, onBack, onCompleted, onToggleSet }: { workout?: WorkoutRecord; completedSets: string[]; onBack: () => void; onCompleted: () => void; onToggleSet: (id: string) => void }) {
  const access = useAccess();
  const feedback = useFeedback();
  const [seconds, setSeconds] = useState(0);
  const [machineReaderOpen, setMachineReaderOpen] = useState(false);
  const [setValues, setSetValues] = useState<Record<string, { load: string; reps: string }>>({});
  const [saving, setSaving] = useState(false);
  const [anatomyExercise, setAnatomyExercise] = useState<ExerciseAnatomyData | null>(null);
  const [anatomyProfile, setAnatomyProfile] = useState<"masculino" | "feminino">("masculino");
  const [exerciseMedia, setExerciseMedia] = useState<Record<string, Pick<ExerciseRecord, "name" | "gifUrl" | "gifMaleUrl" | "gifFemaleUrl">>>({});
  const [openExerciseIndex, setOpenExerciseIndex] = useState<number | null>(null);
  const [restTimer, setRestTimer] = useState<{ exerciseIndex: number; total: number; remaining: number } | null>(null);
  const [completionSummary, setCompletionSummary] = useState<WorkoutCompletionSummary | null>(null);
  const closeAnatomy = useCallback(() => setAnatomyExercise(null), []);
  const exercises: SessionExercise[] = workout?.exerciseDetails?.length ? workout.exerciseDetails.map((exercise) => { const currentMedia = exerciseMedia[exercise.exerciseId] ?? {}; const metricMode = exerciseMetricLabels(exercise).mode; const defaults = defaultExerciseDetails(exercise); return { name: exercise.name, group: exercise.muscleGroup || "Treino", secondaryMuscles: exercise.secondaryMuscles, anatomyRegion: exercise.anatomyRegion, bodyRegion: exercise.bodyRegion, instructions: exercise.instructions, videoUrl: exercise.videoUrl, gifUrl: exerciseGifSource({ ...exercise, ...currentMedia, name: exercise.name }, anatomyProfile), equipmentName: exercise.equipmentName || equipmentForExercise(exercise.name), machineCode: exercise.machineCode, metricMode, sets: Number(exercise.sets) || Number(defaults.sets) || 1, reps: exercise.reps || defaults.reps, load: exercise.load || defaults.load, rest: `${exercise.rest || defaults.rest} s` }; }) : workoutPlan.map((exercise) => ({ ...exercise, metricMode: exerciseMetricLabels(exercise).mode }));
  const totalSets = exercises.reduce((sum, item) => sum + item.sets, 0);
  useEffect(() => {
    if (completionSummary) return;
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [completionSummary]);
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
    if (!db) {
      setExerciseMedia(Object.fromEntries(readLocalCollection<ExerciseRecord>(access.academyId, "exercises").map((exercise) => [exercise.id, { name: exercise.name, gifUrl: exercise.gifUrl, gifMaleUrl: exercise.gifMaleUrl, gifFemaleUrl: exercise.gifFemaleUrl }])));
      return;
    }
    return onSnapshot(collection(db, "academies", access.academyId, "exercises"), (snapshot) => setExerciseMedia(Object.fromEntries(snapshot.docs.map((item) => { const data = item.data() as Omit<ExerciseRecord, "id">; return [item.id, { name: data.name ?? "Exercício", gifUrl: data.gifUrl, gifMaleUrl: data.gifMaleUrl, gifFemaleUrl: data.gifFemaleUrl }]; }))));
  }, [access.academyId]);
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
  const elapsed = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, [seconds]);
  function startRest(exerciseIndex: number) {
    const configuredSeconds = Math.max(1, Number(String(exercises[exerciseIndex].rest).replace(/[^0-9]/g, "")) || 60);
    setRestTimer({ exerciseIndex, total: configuredSeconds, remaining: configuredSeconds });
  }
  function toggleSet(exerciseIndex: number, setIndex: number) {
    const id = `${exerciseIndex}-${setIndex}`;
    const done = completedSets.includes(id);
    const completedBefore = Array.from({ length: exercises[exerciseIndex].sets }).filter((_, index) => completedSets.includes(`${exerciseIndex}-${index}`)).length;
    onToggleSet(id);
    if (!done) {
      startRest(exerciseIndex);
      if (completedBefore + 1 === exercises[exerciseIndex].sets) setOpenExerciseIndex((current) => current === exerciseIndex ? null : current);
    }
  }

  async function finishWorkout() {
    if (completedSets.length < totalSets || saving) return;
    const sets = exercises.flatMap((exercise, exerciseIndex) => Array.from({ length: exercise.sets }).map((_, setIndex) => {
      const id = `${exerciseIndex}-${setIndex}`;
      const value = setValues[id] ?? { load: exercise.load, reps: exercise.reps };
      return { exerciseName: exercise.name, setNumber: setIndex + 1, load: value.load, reps: value.reps };
    }));
    const maxLoad = sets.reduce((max, item) => Math.max(max, Number(item.load.replace(",", ".")) || 0), 0);
    const maxReps = sets.reduce((max, item) => Math.max(max, Number(item.reps.replace(",", ".")) || 0), 0);
    const summaryMetrics = exerciseMetricLabels(exercises.find((exercise) => exercise.metricMode !== "strength") ?? exercises[0]);
    const summary: WorkoutCompletionSummary = { durationSeconds: seconds, calories: Math.max(1, Math.round(seconds / 60 * 5.5)), maxLoad, maxReps, maxMetricLabel: summaryMetrics.load === "Carga" ? "Maior carga" : `Maior ${summaryMetrics.load.toLocaleLowerCase("pt-BR")}`, maxMetricUnit: summaryMetrics.loadUnit, completedSets: completedSets.length, totalSets };
    if (!workout || !db) {
      if (workout) {
        const execution: WorkoutExecution = { id: `local-execution-${Date.now()}`, workoutId: workout.id, workoutName: workout.name, studentId: access.userId === "local-demo" ? localStudentId(access.academyId, access.userId) : access.userId, durationSeconds: seconds, completedSets: completedSets.length, totalSets, sets, calories: summary.calories, maxLoad, maxReps, completedAt: new Date().toISOString() };
        const executions = readLocalCollection<WorkoutExecution>(access.academyId, "workoutExecutions");
        writeLocalCollection(access.academyId, "workoutExecutions", [execution, ...executions]);
      }
      setCompletionSummary(summary);
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
        calories: summary.calories,
        maxLoad,
        maxReps,
        completedAt: serverTimestamp(),
      });
      setCompletionSummary(summary);
    } catch {
      feedback("Não foi possível salvar este treino. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <WorkoutSessionView
      name={workout?.name ?? "Pernas e estabilidade"}
      elapsed={elapsed}
      exercises={exercises}
      completedSets={completedSets}
      openIndex={openExerciseIndex}
      setValues={setValues}
      restTimer={restTimer}
      saving={saving}
      onBack={onBack}
      onOpen={setOpenExerciseIndex}
      onToggleSet={toggleSet}
      onValueChange={(id, field, value, exercise) => setSetValues((current) => ({
        ...current, [id]: { load: current[id]?.load ?? exercise.load, reps: current[id]?.reps ?? exercise.reps, [field]: value },
      }))}
      onRest={startRest}
      onStopRest={() => setRestTimer(null)}
      onAnatomy={(index) => {
        const exercise = exercises[index];
        setAnatomyExercise({ name: exercise.name, primaryMuscle: exercise.anatomyRegion || exercise.group, secondaryMuscles: "secondaryMuscles" in exercise ? exercise.secondaryMuscles : undefined, anatomyProfile, sets: exercise.sets, reps: exercise.reps, rest: exercise.rest });
      }}
      onScan={() => setMachineReaderOpen(true)}
      onFinish={() => void finishWorkout()}
    />
    {anatomyExercise && <ExerciseAnatomyView exercise={anatomyExercise} onClose={closeAnatomy} />}
     {machineReaderOpen && <MachineQrReader exercises={exercises as SessionExercise[]} onClose={() => setMachineReaderOpen(false)} onSelect={(index) => { setOpenExerciseIndex(index); setMachineReaderOpen(false); window.setTimeout(() => document.querySelectorAll(".workout-exercise")[index]?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} />}
     {completionSummary && <WorkoutCompletionSummary name={workout?.name ?? "Treino"} summary={completionSummary} onClose={onCompleted} />}
   </>;
 }

function WorkoutCompletionSummary({ name, summary, onClose }: { name: string; summary: WorkoutCompletionSummary; onClose: () => void }) {
  const access = useAccess();
  const profile = useRegisteredProfile();
  const [sharing, setSharing] = useState(false);
  const studentName = accountName(profile?.name || profile?.displayName || access.user.displayName, access.user.email);
  const profilePhoto = profile?.photoUrl || access.user.photoURL || "";
  if (sharing) return <WorkoutShareCard workoutName={name} studentName={studentName} profilePhoto={profilePhoto} summary={summary} onClose={() => setSharing(false)} />;
  return <div className="workout-completion-backdrop" role="dialog" aria-modal="true" aria-labelledby="workout-completion-title">
    <section className="workout-completion-card"><div className="workout-completion-mark"><Trophy size={25} /></div><small>CONQUISTA REGISTRADA</small><h2 id="workout-completion-title">Treino concluído</h2><p>{name} foi salvo no seu progresso pessoal.</p>
      <div className="workout-completion-metrics"><div><Clock3 size={17} /><small>Tempo total</small><strong>{formatWorkoutDuration(summary.durationSeconds)}</strong></div><div><Flame size={17} /><small>Calorias</small><strong>≈ {summary.calories} kcal</strong></div><div><Dumbbell size={17} /><small>{summary.maxMetricLabel ?? "Maior carga"}</small><strong>{summary.maxLoad > 0 ? `${summary.maxLoad}${summary.maxMetricUnit ? ` ${summary.maxMetricUnit}` : " kg"}` : summary.maxMetricUnit ? `— ${summary.maxMetricUnit}` : "Peso corporal"}</strong></div><div><Activity size={17} /><small>Maior repetição</small><strong>{summary.maxReps || "—"}</strong></div></div>
      <p className="workout-completion-note">{summary.completedSets} de {summary.totalSets} séries registradas. Este resultado aparecerá em <b>Sua evolução</b>.</p><div className="workout-completion-actions"><button type="button" className="workout-share-open" onClick={() => setSharing(true)}><Share2 />Compartilhar conquista</button><button type="button" className="detail-save" onClick={onClose}>Voltar para meus treinos</button></div>
    </section>
  </div>;
}

 const workspaceNav = [
  ["Visão geral", LayoutDashboard],
  ["Alunos", Users],
  ["Professores", UserRoundCheck],
  ["Financeiro", WalletCards],
  ["Estoque", Package],
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
  birthDate?: string | null;
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
  phone?: string | null;
  cpf?: string | null;
  address?: string | null;
  birthDate?: string | null;
  cref?: string | null;
  specialty?: string | null;
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
    if (profile === "Professor" && module === "Financeiro") {
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
      if (profile === "Professor" && detail.module === "Financeiro") {
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
    if (profile === "Professor" && activeModule === "Financeiro") setActiveModule("Visão geral");
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
        {activeModule === "Visão geral" ? children : activeModule === "Alunos" ? <StudentsModule onNewStudent={onNewStudent} onFeedback={feedback} onNavigate={navigateToModule} initialSearch={focusSearch} initialStudentId={focusStudentId ?? ""} /> : activeModule === "Professores" ? <TeachersModule onFeedback={feedback} /> : activeModule === "Financeiro" ? <FinanceModule onFeedback={feedback} billing={<BillingModule onFeedback={feedback} initialStudentId={focusStudentId ?? ""} />} /> : activeModule === "Estoque" ? <StockModule onFeedback={feedback} /> : activeModule === "Treinos" ? <TrainingModule onFeedback={feedback} initialStudentId={focusStudentId ?? ""} /> : activeModule === "Aulas e reservas" ? <ClassesModule onFeedback={feedback} /> : activeModule === "Avaliações" ? <AssessmentsModule onFeedback={feedback} initialStudentId={focusStudentId ?? ""} /> : <WorkspaceModule title={activeModule} profile={profile} onFeedback={feedback} />}
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
    : [["Visão geral", LayoutDashboard], ["Alunos", Users], ["Professores", UserRoundCheck], ["Financeiro", WalletCards], ["Estoque", Package]] as const;
  return <nav className="workspace-mobile-nav" aria-label="Acessos rápidos">{items.map(([label, Icon]) => <button key={label} className={activeModule === label ? "active" : ""} onClick={() => onNavigate(label)}><Icon /><span>{label === "Visão geral" ? "Início" : label}</span></button>)}<button onClick={onMore}><MoreHorizontal /><span>Mais</span></button></nav>;
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
type BillingStudent = { id: string; name: string; active: boolean; userId?: string | null; teacherId?: string | null; birthDate?: string | null };
type BillingPlan = { id: string; name: string; price: number; active: boolean };
type PaymentMethod = "pix" | "cartao_credito" | "cartao_debito" | "maquininha" | "dinheiro" | "transferencia" | "boleto";
type ChargeType = "monthly" | "registration" | "service";
type MonthlyCharge = { id: string; studentId: string; studentName: string; planName: string; amount: number; dueDate: string; status: "pending" | "paid"; paymentMethod?: PaymentMethod; chargeType?: ChargeType };
function paymentMethodLabel(method?: PaymentMethod) { return method === "cartao_credito" ? "Cartão de crédito" : method === "cartao_debito" ? "Cartão de débito" : method === "maquininha" ? "Cartão (registro antigo)" : method === "pix" ? "Pix" : method === "dinheiro" ? "Dinheiro" : method === "transferencia" ? "Transferência" : method === "boleto" ? "Boleto" : method || ""; }
type BodyRegion = "Membros superiores" | "Tronco anterior" | "Tronco posterior" | "Região central" | "Membros inferiores";
type ExercisePhase = "Preparação" | "Treino principal" | "Cardio" | "Finalização";
type ExerciseType = "Força" | "Peso corporal" | "Alongamento" | "Cardio";
type ExerciseRecord = { id: string; name: string; muscleGroup: string; secondaryMuscles?: string; anatomyRegion?: string; instructions?: string; videoUrl?: string; gifUrl?: string; gifPath?: string; gifMaleUrl?: string; gifMalePath?: string; gifFemaleUrl?: string; gifFemalePath?: string; gifMatch?: "exact" | "equivalent"; equipmentName?: string; machineCode?: string; bodyRegion?: BodyRegion; phase?: ExercisePhase; exerciseType?: ExerciseType };
type WorkoutExerciseDetail = { exerciseId: string; name: string; sets: string; reps: string; load: string; rest: string; muscleGroup?: string; secondaryMuscles?: string; anatomyRegion?: string; instructions?: string; videoUrl?: string; gifUrl?: string; gifPath?: string; gifMaleUrl?: string; gifMalePath?: string; gifFemaleUrl?: string; gifFemalePath?: string; equipmentName?: string; machineCode?: string; bodyRegion?: BodyRegion; phase?: ExercisePhase; exerciseType?: ExerciseType };

type ExerciseMetricMode = "strength" | "cardio" | "timed";
type ExerciseMetricLabels = { mode: ExerciseMetricMode; sets: string; reps: string; load: string; rest: string; repsUnit: string; loadUnit: string; repsInputMode: "numeric" | "decimal"; loadInputMode: "numeric" | "decimal" };
type ExerciseMetricSource = { name: string; exerciseType?: ExerciseType; equipmentName?: string; muscleGroup?: string };

function exerciseMetricLabels(exercise: ExerciseMetricSource): ExerciseMetricLabels {
  const text = `${exercise.name} ${exercise.equipmentName ?? ""} ${exercise.muscleGroup ?? ""}`.toLocaleLowerCase("pt-BR");
  const isCardio = exercise.exerciseType === "Cardio" || /bicicleta|bike|esteira|corrida|caminhada|elípt|elipt|remo ergométrico|escada ergométrica|transport|stair|air bike|cardio/.test(text);
  if (isCardio) return { mode: "cardio", sets: "Blocos", reps: "Tempo", load: "Velocidade", rest: "Recuperação", repsUnit: "min", loadUnit: "km/h", repsInputMode: "decimal", loadInputMode: "decimal" };
  const isTimed = exercise.exerciseType === "Alongamento" || /alongamento|mobilidade|prancha|isometr|wall sit/.test(text);
  if (isTimed) return { mode: "timed", sets: "Séries", reps: "Tempo", load: "Intensidade", rest: "Descanso", repsUnit: "s", loadUnit: "", repsInputMode: "numeric", loadInputMode: "numeric" };
  return { mode: "strength", sets: "Séries", reps: "Repetições", load: "Carga", rest: "Descanso", repsUnit: "rep.", loadUnit: "kg", repsInputMode: "numeric", loadInputMode: "decimal" };
}

function defaultExerciseDetails(exercise: ExerciseMetricSource) {
  const labels = exerciseMetricLabels(exercise);
  return labels.mode === "cardio" ? { sets: "1", reps: "20", load: "6", rest: "60" } : labels.mode === "timed" ? { sets: "3", reps: "30", load: "0", rest: "60" } : { sets: "3", reps: "10", load: "0", rest: "60" };
}
type WorkoutRecord = { id: string; name: string; studentId: string; studentName: string; studentRecordId?: string | null; studentUserId?: string | null; recommendedDay?: WorkoutTemplateDay; level?: WorkoutLevel; audience?: WorkoutTemplateAudience; exerciseIds: string[]; exerciseDetails?: WorkoutExerciseDetail[]; status: "draft" | "published" };
type WorkoutLevel = "Fundação" | "Evolução" | "Performance" | "Elite";
type WorkoutTemplateAudience = "Geral" | "Personalizado";
const workoutTemplateDayOptions = ["Flexível", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"] as const;
type WorkoutTemplateDay = (typeof workoutTemplateDayOptions)[number];
const workoutTemplateDayOrder: WorkoutTemplateDay[] = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo", "Flexível"];
const workoutLevelOrder: WorkoutLevel[] = ["Fundação", "Evolução", "Performance", "Elite"];
type WorkoutTemplateRecord = { id: string; name: string; level?: WorkoutLevel; audience?: WorkoutTemplateAudience; scheduleDay?: WorkoutTemplateDay; focusLabel?: string; targetStudentId?: string | null; targetStudentName?: string | null; seedKey?: string; exerciseIds: string[]; exerciseDetails: WorkoutExerciseDetail[]; createdBy: string };
type ClassRecord = { id: string; name: string; instructor: string; date: string; time: string; capacity: number; active: boolean };
type AttendanceRecord = { id: string; classId: string; className: string; studentId: string; studentName: string; date: string; time: string };
type AssessmentRecord = { id: string; studentId: string; studentName: string; date: string; weight: string; height: string; bodyFat: string; biceps?: string; waist?: string; chest?: string; thigh?: string; notes: string };
type WorkoutExecution = { id: string; workoutId: string; workoutName: string; studentId: string; durationSeconds: number; completedSets: number; totalSets: number; sets: Array<{ exerciseName: string; setNumber: number; load: string; reps: string }>; calories?: number; maxLoad?: number; maxReps?: number; completedAt?: { toDate?: () => Date } | string | Date };

function workoutExecutionTime(value: WorkoutExecution["completedAt"]) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  return value?.toDate?.().getTime() ?? 0;
}

function formatWorkoutDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(safeSeconds / 60)}min ${String(safeSeconds % 60).padStart(2, "0")}s`;
}

type WorkoutCompletionSummary = { durationSeconds: number; calories: number; maxLoad: number; maxReps: number; maxMetricLabel?: string; maxMetricUnit?: string; completedSets: number; totalSets: number };

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
    const unsubscribeStudents = onSnapshot(collection(db, "academies", access.academyId, "students"), (snapshot) => setStudents(snapshot.docs.map((student) => { const data = student.data() as { name?: string; active?: boolean; birthDate?: string | null }; return { id: student.id, name: data.name ?? "Aluno sem nome", birthDate: data.birthDate ?? null, active: data.active !== false }; })));
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
  const selectedStudentProfile = students.find((item) => item.id === (selectedStudentId || studentId));
  const selectedStudentAge = calculateAge(selectedStudentProfile?.birthDate);
  const selectedLatest = selectedAssessments[0] ?? null;
  const selectedPrevious = selectedAssessments[1] ?? null;
  const selectedDelta = (key: "weight" | "bodyFat" | "biceps" | "waist" | "chest" | "thigh") => {
    const current = selectedLatest?.[key] ? Number(selectedLatest[key]!.replace(",", ".")) : null;
    const previous = selectedPrevious?.[key] ? Number(selectedPrevious[key]!.replace(",", ".")) : null;
    return current !== null && previous !== null ? current - previous : null;
  };
  useEffect(() => { if (selectedStudentId && selectedLatest) scrollToContent(".staff-assessment-detail"); }, [selectedStudentId, selectedLatest?.id]);

  return (
    <div className="workspace-content module-view">
      <section className="workspace-intro"><div><span>EVOLUÇÃO · GESTÃO</span><h2>Avaliações físicas</h2><p>{selectedStudentProfile ? `${selectedStudentProfile.name} · ${selectedStudentAge !== null ? `${selectedStudentAge} anos` : "data de nascimento não informada"}` : "Registre medidas básicas e acompanhe a evolução dos alunos."}</p></div></section>
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
    scrollToContent(".classes-layout .plan-form-panel");
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

function exercisePhaseGuide(phase: ExercisePhase) {
  if (phase === "Preparação") return { label: "Aquecimento e mobilidade", detail: "Selecione de 1 a 3 exercícios antes da parte principal." };
  if (phase === "Cardio") return { label: "Condicionamento cardiovascular", detail: "Escolha a modalidade e ajuste o volume conforme o objetivo do aluno." };
  if (phase === "Finalização") return { label: "Desaceleração e recuperação", detail: "Use para alongamento leve ou exercícios de encerramento." };
  return { label: "Força e musculação", detail: "Escolha primeiro a região do corpo, depois o grupo muscular e o movimento." };
}

function ExercisePicker({ exercises, selectedExercises, exerciseDetails, onToggle, onParameterChange, onEdit, onRemove, onPreview, accessRole }: { exercises: ExerciseRecord[]; selectedExercises: string[]; exerciseDetails: Record<string, Omit<WorkoutExerciseDetail, "exerciseId" | "name">>; onToggle: (exercise: ExerciseRecord) => void; onParameterChange: (exerciseId: string, field: "sets" | "reps" | "load" | "rest", value: string) => void; onEdit: (exercise: ExerciseRecord) => void; onRemove: (exercise: ExerciseRecord) => void; onPreview: (exercise: ExerciseRecord) => void; accessRole: string }) {
  const [openPhases, setOpenPhases] = useState<ExercisePhase[]>([]);
  const [openMuscleGroups, setOpenMuscleGroups] = useState<string[]>([]);
  function togglePhase(currentPhase: ExercisePhase) {
    setOpenPhases((current) => current.includes(currentPhase) ? current.filter((item) => item !== currentPhase) : [...current, currentPhase]);
  }
  function toggleMuscleGroup(groupKey: string) { setOpenMuscleGroups((current) => current.includes(groupKey) ? current.filter((item) => item !== groupKey) : [...current, groupKey]); }
  return <div className="exercise-picker"><div className="exercise-picker-intro"><span>2 · BIBLIOTECA JÁ CADASTRADA</span><strong>Escolha os exercícios da ficha</strong><p>Preparação, treino principal e cardio são fases da mesma biblioteca. Use <b>Adicionar</b> para colocar um movimento no programa.</p></div>{exercisePhaseOrder.map((currentPhase) => {
    const phaseExercises = exercises.filter((exercise) => (exercise.phase ?? "Treino principal") === currentPhase);
    if (!phaseExercises.length) return null;
    const isOpen = openPhases.includes(currentPhase);
    const guide = exercisePhaseGuide(currentPhase);
     return <section className={isOpen ? "exercise-phase-group open" : "exercise-phase-group"} key={currentPhase}><button className="collapse-header" type="button" onClick={() => togglePhase(currentPhase)}><span>{isOpen ? <ChevronDown /> : <ChevronRight />}{exercisePhaseIcon(currentPhase)}{currentPhase}</span><small>{phaseExercises.length} exercícios · {guide.label}</small></button>{isOpen && <div className="collapse-content"><div className="exercise-phase-guide"><strong>{guide.label}</strong><p>{guide.detail}</p><ol><li>Escolha a região do corpo.</li><li>Abra o grupo muscular.</li><li>Marque o exercício e ajuste os parâmetros indicados para o movimento.</li></ol></div>{exerciseRegionOrder.map((region) => {
      const regionExercises = phaseExercises.filter((exercise) => (exercise.bodyRegion ?? "Membros superiores") === region);
      if (!regionExercises.length) return null;
      return <div className="exercise-region-group" key={region}><h4>{exerciseRegionIcon(region)}{region}</h4>{Array.from(new Set(regionExercises.map((exercise) => exercise.muscleGroup))).map((muscleGroup) => { const groupKey = `${currentPhase}:${region}:${muscleGroup}`; const groupOpen = openMuscleGroups.includes(groupKey); const groupExercises = regionExercises.filter((exercise) => exercise.muscleGroup === muscleGroup); return <div className={groupOpen ? "exercise-class-group open" : "exercise-class-group"} key={groupKey}><button className="exercise-muscle-toggle" type="button" onClick={() => toggleMuscleGroup(groupKey)}><span>{groupOpen ? <ChevronDown /> : <ChevronRight />}{muscleGroup}</span><small>{groupExercises.length} exercícios</small></button>{groupOpen && <div className="exercise-muscle-content">{groupExercises.map((exercise) => { const selected = selectedExercises.includes(exercise.id); const preview = exerciseGifSource(exercise); const metrics = exerciseMetricLabels(exercise); const defaults = defaultExerciseDetails(exercise); return <div className={selected ? "exercise-choice selected" : "exercise-choice"} key={exercise.id}><div className="exercise-choice-main"><div className="exercise-choice-info">{preview && <HoverGifPreview className="exercise-choice-gif" src={preview} alt={`Demonstração de ${exercise.name}`} />}<span><strong>{exercise.name}</strong><small>{exercise.exerciseType ?? "Força"}{exercise.secondaryMuscles ? ` · auxiliares: ${exercise.secondaryMuscles}` : ""}{exercise.equipmentName ? ` · máquina: ${exercise.equipmentName}` : ""}{!preview && " · sem GIF vinculado"}</small></span></div><div className="exercise-actions exercise-choice-actions"><button type="button" className={selected ? "exercise-add-button added" : "exercise-add-button"} onClick={() => onToggle(exercise)}>{selected ? <><Check size={14} /> Adicionado</> : <><Plus size={14} /> Adicionar</>}</button><button type="button" className="exercise-preview-button" onClick={() => onPreview(exercise)}><Eye size={13} /> Ver</button><button type="button" onClick={() => onEdit(exercise)}>Editar</button>{accessRole === "admin" && <button type="button" onClick={() => onRemove(exercise)}>Excluir</button>}</div></div>{selected && <div className="exercise-parameters"><label>{metrics.sets}<input inputMode="numeric" value={exerciseDetails[exercise.id]?.sets ?? defaults.sets} onChange={(event) => onParameterChange(exercise.id, "sets", event.target.value)} /></label><label>{metrics.reps}<small className="exercise-field-unit">{metrics.repsUnit}</small><input inputMode={metrics.repsInputMode} placeholder={defaults.reps} value={exerciseDetails[exercise.id]?.reps ?? defaults.reps} onChange={(event) => onParameterChange(exercise.id, "reps", event.target.value)} /></label><label>{metrics.load}<small className="exercise-field-unit">{metrics.loadUnit || "sem unidade"}</small><input inputMode={metrics.loadInputMode} placeholder={defaults.load} value={exerciseDetails[exercise.id]?.load ?? defaults.load} onChange={(event) => onParameterChange(exercise.id, "load", event.target.value)} /></label><label>{metrics.rest}<small className="exercise-field-unit">s</small><input inputMode="numeric" value={exerciseDetails[exercise.id]?.rest ?? defaults.rest} onChange={(event) => onParameterChange(exercise.id, "rest", event.target.value)} /></label></div>}</div>; })}</div>}</div>; })}</div>;
    })}</div>}</section>;
  })}</div>;
}

function ExercisePreviewModal({ exercise, detail, onClose }: { exercise: ExerciseRecord; detail?: Omit<WorkoutExerciseDetail, "exerciseId" | "name">; onClose: () => void }) {
  const preview = exerciseGifSource(exercise);
  const sets = Math.max(1, Math.min(12, Number(detail?.sets ?? 3) || 3));
  const metrics = exerciseMetricLabels(exercise);
  const defaults = defaultExerciseDetails(exercise);
  const reps = detail?.reps ?? defaults.reps;
  const load = detail?.load ?? defaults.load;
  return <div className="training-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="exercise-preview-title"><section className="training-preview-panel exercise-preview-panel"><header><div><span>PRÉVIA DO ALUNO</span><h2 id="exercise-preview-title">Como este exercício aparecerá</h2><p>Esta visualização não altera nem salva a ficha.</p></div><button type="button" aria-label="Fechar prévia" onClick={onClose}><X /></button></header><div className="student-exercise-preview"><div className="student-exercise-preview-media">{preview ? <img src={preview} alt={`Demonstração de ${exercise.name}`} /> : <span>GIF ainda não vinculado</span>}</div><div className="student-exercise-preview-copy"><small>{exercise.phase ?? "Treino principal"} · {exercise.muscleGroup}</small><h3>{exercise.name}</h3><p>{exercise.instructions || "A orientação de execução será adicionada pelo professor."}</p>{exercise.equipmentName && <span className="student-preview-equipment">{exercise.equipmentName}</span>}</div><div className="student-preview-metrics"><div><small>{metrics.sets.toUpperCase()}</small><strong>{sets}</strong></div><div><small>{metrics.reps.toUpperCase()}</small><strong>{reps} {metrics.repsUnit}</strong></div><div><small>{metrics.load.toUpperCase()}</small><strong>{load}{metrics.loadUnit ? ` ${metrics.loadUnit}` : ""}</strong></div><div><small>{metrics.rest.toUpperCase()}</small><strong>{detail?.rest ?? defaults.rest} s</strong></div></div><div className="student-preview-series">{Array.from({ length: sets }, (_, index) => <div key={index}><span>{index + 1}</span><strong>{reps} {metrics.repsUnit}</strong><small>{load}{metrics.loadUnit ? ` ${metrics.loadUnit}` : ""}</small><em>Não concluída</em></div>)}</div><button className="detail-save" type="button" onClick={onClose}>Fechar prévia</button></div></section></div>;
}

function WorkoutExecutionPreviewModal({ exercises, selectedExercises, exerciseDetails, title = "Como a ficha será recebida", onClose }: { exercises: ExerciseRecord[]; selectedExercises: string[]; exerciseDetails: Record<string, Omit<WorkoutExerciseDetail, "exerciseId" | "name">>; title?: string; onClose: () => void }) {
  const selected = selectedExercises.map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is ExerciseRecord => Boolean(exercise));
  return <div className="training-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="workout-preview-title"><section className="training-preview-panel workout-execution-preview-panel"><header><div><span>PRÉVIA DO ALUNO · TREINO EM EXECUÇÃO</span><h2 id="workout-preview-title">{title}</h2><p>Confira a ordem, os GIFs e os parâmetros antes de salvar ou enviar.</p></div><button type="button" aria-label="Fechar prévia" onClick={onClose}><X /></button></header><div className="workout-execution-preview-list">{selected.map((exercise, index) => { const detail = exerciseDetails[exercise.id]; const preview = exerciseGifSource(exercise); const metrics = exerciseMetricLabels(exercise); const defaults = defaultExerciseDetails(exercise); return <article className="student-execution-preview-card" key={exercise.id}><div className="student-execution-preview-index">{String(index + 1).padStart(2, "0")}</div><div className="student-execution-preview-media">{preview ? <img src={preview} alt={`Demonstração de ${exercise.name}`} /> : <span>Sem GIF</span>}</div><div className="student-execution-preview-copy"><small>{exercise.phase ?? "Treino principal"} · {exercise.muscleGroup}</small><h3>{exercise.name}</h3><p>{exercise.instructions || "Orientação objetiva será adicionada pelo professor."}</p><div className="student-preview-inline-metrics"><span><b>{detail?.sets ?? defaults.sets}</b> {metrics.sets.toLowerCase()}</span><span><b>{detail?.reps ?? defaults.reps}</b> {metrics.reps.toLowerCase()} ({metrics.repsUnit})</span><span><b>{detail?.load ?? defaults.load}</b> {metrics.load.toLowerCase()}{metrics.loadUnit ? ` (${metrics.loadUnit})` : ""}</span><span><b>{detail?.rest ?? defaults.rest}</b> s {metrics.rest.toLowerCase()}</span></div></div></article>; })}</div><button className="detail-save" type="button" onClick={onClose}>Fechar prévia</button></section></div>;
}

function WorkoutComposition({ exercises, selectedExercises, exerciseDetails, canSave, canPublish, saving, onSave, onPreview, onParameterChange, onRemove }: { exercises: ExerciseRecord[]; selectedExercises: string[]; exerciseDetails: Record<string, Omit<WorkoutExerciseDetail, "exerciseId" | "name">>; canSave: boolean; canPublish: boolean; saving: boolean; onSave: () => void; onPreview: () => void; onParameterChange: (exerciseId: string, field: "sets" | "reps" | "load" | "rest", value: string) => void; onRemove: (exercise: ExerciseRecord) => void }) {
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const selected = selectedExercises.map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is ExerciseRecord => Boolean(exercise));
  return <section className="workout-composition" aria-label="Exercícios incluídos no modelo"><header><div><small>MODELO EM MONTAGEM</small><strong>{selected.length} {selected.length === 1 ? "exercício adicionado" : "exercícios adicionados"}</strong></div><div className="workout-composition-header-actions"><span>Use o botão + na biblioteca abaixo</span><button className="detail-secondary" type="button" onClick={onPreview} disabled={saving}><Eye size={13} /> Ver em execução</button><button className="detail-secondary" type="button" onClick={onSave} disabled={saving}>Salvar programa-base</button><button className="detail-save" type="submit" disabled={saving}>{saving ? "Enviando..." : "Enviar para aluno"}</button></div></header>{!selected.length ? <p>Comece por preparação, depois escolha os movimentos principais e finalize com cardio ou recuperação.</p> : <div>{selected.map((exercise, index) => { const editing = editingExerciseId === exercise.id; const detail = exerciseDetails[exercise.id]; const metrics = exerciseMetricLabels(exercise); const defaults = defaultExerciseDetails(exercise); return <article className={editing ? "editing" : ""} key={exercise.id}><div className="workout-composition-row"><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{exercise.name}</strong><small>{exercise.phase ?? "Treino principal"} · {exercise.muscleGroup} · {detail?.sets ?? defaults.sets} {metrics.sets.toLowerCase()} × {detail?.reps ?? defaults.reps} {metrics.repsUnit}</small></div><div className="workout-composition-actions"><button type="button" className="workout-adjust-button" title="Ajustar séries, tempo, velocidade, carga e descanso" aria-label={`Ajustar parâmetros de ${exercise.name}`} onClick={() => setEditingExerciseId(editing ? null : exercise.id)}>{editing ? "Concluir" : "Ajustar"}</button><button type="button" aria-label={`Remover ${exercise.name} do modelo`} onClick={() => onRemove(exercise)}><X size={15} /></button></div></div>{editing && <div className="workout-inline-parameters"><label>{metrics.sets}<input inputMode="numeric" value={detail?.sets ?? defaults.sets} onChange={(event) => onParameterChange(exercise.id, "sets", event.target.value)} /></label><label>{metrics.reps}<small className="exercise-field-unit">{metrics.repsUnit}</small><input inputMode={metrics.repsInputMode} value={detail?.reps ?? defaults.reps} onChange={(event) => onParameterChange(exercise.id, "reps", event.target.value)} /></label><label>{metrics.load}<small className="exercise-field-unit">{metrics.loadUnit || "sem unidade"}</small><input inputMode={metrics.loadInputMode} value={detail?.load ?? defaults.load} onChange={(event) => onParameterChange(exercise.id, "load", event.target.value)} /></label><label>{metrics.rest}<small className="exercise-field-unit">s</small><input inputMode="numeric" value={detail?.rest ?? defaults.rest} onChange={(event) => onParameterChange(exercise.id, "rest", event.target.value)} /></label></div>}</article>; })}</div>}</section>;
}

function HoverGifPreview({ src, alt, className, placeholder = "GIF" }: { src?: string; alt: string; className: string; placeholder?: string }) {
  if (!src) return <span className={`${className} is-empty`} aria-label={`${alt}. ${placeholder} ainda não vinculado`}>{placeholder}<small>Sem demonstração</small></span>;
  return <span className={`${className} is-playing`} role="img" aria-label={alt}><img src={src} alt="" loading="lazy" /></span>;
}

function gifLibraryStoragePath(file: string) {
  return `gif-library/${file.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function CatalogGifPreview({ item }: { item: GifCatalogItem }) {
  const localPreview = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) ? item.url : "";
  const [source, setSource] = useState(localPreview);
  const [loading, setLoading] = useState(!localPreview);
  useEffect(() => {
    let active = true;
    const local = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) ? item.url : "";
    setSource(local);
    setLoading(!local);
    if (storage) getDownloadURL(storageRef(storage, gifLibraryStoragePath(item.file))).then((url) => { if (active) { setSource(url); setLoading(false); } }).catch(() => { if (active) { setSource(local); setLoading(false); } });
    else setLoading(false);
    return () => { active = false; };
  }, [item.file, item.url]);
  if (!source) return <span className="gif-catalog-preview is-empty"><small>{loading ? "Carregando GIF…" : "Importe este GIF uma vez"}<b>{loading ? "Firebase Storage" : "Central do desenvolvedor"}</b></small></span>;
  return <span className="gif-catalog-preview" role="img" aria-label={`Prévia de ${item.name}`}><img src={source} alt="" loading="lazy" onError={() => setSource("")} /></span>;
}

function ExerciseLibrary({ exercises, accessRole, onEdit, onLinkGif, onRemove, onPreview }: { exercises: ExerciseRecord[]; accessRole: string; onEdit: (exercise: ExerciseRecord) => void; onLinkGif: (exercise: ExerciseRecord) => void; onRemove: (exercise: ExerciseRecord) => void; onPreview: (exercise: ExerciseRecord) => void }) {
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  function toggleGroup(group: string) { setOpenGroups((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group]); }
  return <div className="exercise-library">
    <div className="library-phase-legend"><span>FASES DA BIBLIOTECA</span><p>Os exercícios abaixo já estão cadastrados. A fase indica onde o professor pode usá-los na montagem da ficha.</p><div>{exercisePhaseOrder.filter((phase) => exercises.some((exercise) => (exercise.phase ?? "Treino principal") === phase)).map((phase) => <em key={phase}>{phase}</em>)}</div></div>
    {exercisePhaseOrder.map((phase) => {
      const phaseExercises = exercises.filter((exercise) => (exercise.phase ?? "Treino principal") === phase);
      if (!phaseExercises.length) return null;
      const phaseKey = `phase:${phase}`;
      const isPhaseOpen = openGroups.includes(phaseKey);
      const guide = exercisePhaseGuide(phase);
      return <section className={isPhaseOpen ? "library-phase-group open" : "library-phase-group"} key={phase}>
        <button className="collapse-header library-phase-header" type="button" onClick={() => toggleGroup(phaseKey)}><span>{isPhaseOpen ? <ChevronDown /> : <ChevronRight />}{exercisePhaseIcon(phase)}{phase}</span><small>{phaseExercises.length} exercícios · {guide.label}</small></button>
        {isPhaseOpen && <div className="collapse-content"><p className="library-phase-description">{guide.detail}</p>{exerciseRegionOrder.map((region) => {
          const regionExercises = phaseExercises.filter((exercise) => (exercise.bodyRegion ?? "Membros superiores") === region);
          if (!regionExercises.length) return null;
          const regionKey = `${phaseKey}:${region}`;
          const isRegionOpen = openGroups.includes(regionKey);
          return <section className={isRegionOpen ? "library-region-group open" : "library-region-group"} key={region}>
            <button className="collapse-header" type="button" onClick={() => toggleGroup(regionKey)}><span>{isRegionOpen ? <ChevronDown /> : <ChevronRight />}{exerciseRegionIcon(region)}{region}</span><small>{regionExercises.length} exercícios</small></button>
            {isRegionOpen && <div className="collapse-content">{Array.from(new Set(regionExercises.map((exercise) => exercise.muscleGroup))).map((muscleGroup) => <div className="library-class-group" key={`${regionKey}-${muscleGroup}`}>
              <div className="library-class-heading"><h4>{muscleGroup}</h4><small>{regionExercises.filter((exercise) => exercise.muscleGroup === muscleGroup).length} exercícios</small></div>
              {regionExercises.filter((exercise) => exercise.muscleGroup === muscleGroup).map((exercise) => { const maleGif = exerciseGifSource(exercise); const femaleGif = exerciseGifSource(exercise, "feminino"); const hasSavedGif = Boolean(exercise.gifMaleUrl || exercise.gifUrl || exercise.gifFemaleUrl); return <div className="library-exercise-row" key={exercise.id}>
                <HoverGifPreview className="library-exercise-gif" src={maleGif} alt={`Demonstração de ${exercise.name}`} />
                <div><strong>{exercise.name}</strong><small>{exercise.exerciseType ?? "Força"}{exercise.secondaryMuscles ? ` · auxiliares: ${exercise.secondaryMuscles}` : ""}{exercise.equipmentName ? ` · máquina: ${exercise.equipmentName}` : ""}{maleGif && femaleGif ? " · GIF masculino e feminino" : maleGif ? " · GIF masculino" : femaleGif ? " · GIF feminino" : " · sem GIF"}{exercise.gifMatch === "equivalent" ? " · demonstração equivalente" : ""}{!hasSavedGif && maleGif ? " · catálogo revisado" : ""}</small></div>
                <div className="exercise-actions"><button type="button" onClick={() => onLinkGif(exercise)}>{maleGif || femaleGif ? "Ajustar GIF" : "Vincular GIF"}</button><button type="button" className="exercise-preview-button" onClick={() => onPreview(exercise)}><Eye size={13} /> Ver</button><button type="button" onClick={() => onEdit(exercise)}>Editar</button>{accessRole === "admin" && <button type="button" onClick={() => onRemove(exercise)}>Excluir</button>}</div>
              </div>; })}
            </div>)}</div>}
          </section>;
        })}</div>}
      </section>;
    })}
  </div>;
}

type GifCatalogItem = { id: string; name: string; file: string; url: string; equipment: string; muscle: string; profile: "masculino" | "feminino" };
type SelectedCatalogGif = { url: string; path: string; profile: "masculino" | "feminino" };

function GifCatalogPicker({ open, initialQuery, initialEquipment, initialMuscle, usedGifPaths, onClose, onSelect }: { open: boolean; initialQuery: string; initialEquipment: string; initialMuscle: string; usedGifPaths: string[]; onClose: () => void; onSelect: (item: GifCatalogItem) => Promise<void> }) {
  const [items, setItems] = useState<GifCatalogItem[]>([]);
  const [profileFilter, setProfileFilter] = useState<"" | "masculino" | "feminino">("");
  const [equipment, setEquipment] = useState("");
  const [muscle, setMuscle] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  useEffect(() => {
    if (!open || items.length) return;
    setLoading(true);
    Promise.all([fetch("/gif-catalog.json"), fetch("/gif-catalog-feminine.json")]).then(async ([maleResponse, femaleResponse]) => {
      const male = maleResponse.ok ? await maleResponse.json() as Array<Omit<GifCatalogItem, "profile">> : [];
      const female = femaleResponse.ok ? await femaleResponse.json() as Array<Omit<GifCatalogItem, "profile">> : [];
      setItems([...male.map((item) => ({ ...item, profile: "masculino" as const })), ...female.map((item) => ({ ...item, profile: "feminino" as const }))]);
    }).catch(() => setItems([])).finally(() => setLoading(false));
  }, [items.length, open]);
  useEffect(() => { if (open) { setProfileFilter(""); setQuery(initialQuery); setEquipment(initialEquipment); setMuscle(initialMuscle); } }, [initialEquipment, initialMuscle, initialQuery, open]);
  if (!open) return null;
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const usedPaths = new Set(usedGifPaths.map((path) => path.replace(/^\/+/, "")));
  const scopedItems = items.filter((item) => !profileFilter || item.profile === profileFilter);
  const equipmentFolders = Array.from(new Set(scopedItems.map((item) => item.equipment))).sort();
  const muscleFolders = Array.from(new Set(scopedItems.filter((item) => !equipment || item.equipment === equipment).map((item) => item.muscle))).sort();
  const filtered = scopedItems.filter((item) => (!equipment || item.equipment === equipment) && (!muscle || item.muscle === muscle) && (!normalized || `${item.name} ${item.equipment} ${item.muscle} ${item.profile}`.toLocaleLowerCase("pt-BR").includes(normalized))).slice(0, 48);
  const usedCount = items.filter((item) => usedPaths.has(gifLibraryStoragePath(item.file))).length;
  return <div className="gif-catalog-modal" role="dialog" aria-modal="true" aria-label="Catálogo de GIFs"><div className="gif-catalog-panel"><header><div><span>CATÁLOGO DA BIBLIOTECA · TODOS OS PERFIS</span><h3>Escolher demonstração</h3><p>Navegue pelas pastas de perfil, equipamento, grupo muscular e exercício.</p></div><button type="button" aria-label="Fechar catálogo" onClick={onClose}><X /></button></header>{loading ? <p className="panel-helper">Carregando os catálogos masculino e feminino…</p> : <><div className="gif-catalog-summary" aria-label="Resumo da biblioteca"><div><small>CATÁLOGO TOTAL</small><strong>{items.length.toLocaleString("pt-BR")}</strong><span>GIFs disponíveis</span></div><div><small>EM USO NESTA ACADEMIA</small><strong>{usedCount.toLocaleString("pt-BR")}</strong><span>já vinculados a exercícios</span></div><div><small>DISPONÍVEIS</small><strong>{Math.max(0, items.length - usedCount).toLocaleString("pt-BR")}</strong><span>prontos para usar</span></div></div><p className="panel-helper">Escolha uma pasta de perfil para separar os GIFs masculinos e femininos, ou mantenha “Todos” para pesquisar a biblioteca completa.</p><div className="gif-folder-browser"><div><small>1 · PERFIL DA DEMONSTRAÇÃO</small><div className="gif-folder-list"><button type="button" className={!profileFilter ? "active" : ""} onClick={() => { setProfileFilter(""); setEquipment(""); setMuscle(""); setQuery(""); }}>TODOS OS GIFS</button><button type="button" className={profileFilter === "masculino" ? "active" : ""} onClick={() => { setProfileFilter("masculino"); setEquipment(""); setMuscle(""); setQuery(""); }}>MASCULINO</button><button type="button" className={profileFilter === "feminino" ? "active" : ""} onClick={() => { setProfileFilter("feminino"); setEquipment(""); setMuscle(""); setQuery(""); }}>FEMININO</button></div></div><div><small>2 · EQUIPAMENTO</small><div className="gif-folder-list">{equipmentFolders.map((folder) => <button type="button" className={equipment === folder ? "active" : ""} key={folder} onClick={() => { setEquipment(folder); setMuscle(""); setQuery(""); }}>{folder.replace("EXERCÍCIOS ", "")}</button>)}</div></div><div><small>3 · GRUPO MUSCULAR</small><div className="gif-folder-list">{muscleFolders.map((folder) => <button type="button" className={muscle === folder ? "active" : ""} key={folder} onClick={() => { setMuscle(folder); setQuery(""); }}>{folder}</button>)}</div></div></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca opcional: shoulder, bench press, squat..." />{!equipment && <p className="panel-helper">Escolha uma pasta de equipamento para refinar os movimentos.</p>}<div className="gif-catalog-grid">{filtered.map((item) => { const inUse = usedPaths.has(gifLibraryStoragePath(item.file)); return <button type="button" className={inUse ? "is-in-use" : ""} key={`${item.file}-${item.id}`} disabled={selectingId === item.id} onClick={async () => { setSelectingId(item.id); await onSelect(item); setSelectingId(null); }}><CatalogGifPreview item={item} /><span><strong>{item.name.replace(/[-_]+/g, " ")}</strong><small>{item.profile === "feminino" ? "Feminino" : "Masculino"} · {item.equipment} · {item.muscle}</small><em className={inUse ? "gif-use-badge used" : "gif-use-badge"}>{inUse ? "Em uso" : "Disponível"}</em></span></button>; })}</div>{!filtered.length && equipment && <p className="panel-helper">Não há GIF nessa combinação de pastas.</p>}</>}</div></div>;
}

function PublishedWorkouts({ templates, workouts, onEditTemplate, onRemoveTemplate, onEditWorkout, onRemoveWorkout, onPreviewTemplate, onPreviewWorkout, onPrintTemplate, onSeedGeneralPrograms }: { templates: WorkoutTemplateRecord[]; workouts: WorkoutRecord[]; onEditTemplate: (template: WorkoutTemplateRecord) => void; onRemoveTemplate: (template: WorkoutTemplateRecord) => void; onEditWorkout: (workout: WorkoutRecord) => void; onRemoveWorkout: (workout: WorkoutRecord) => void; onPreviewTemplate: (template: WorkoutTemplateRecord) => void; onPreviewWorkout: (workout: WorkoutRecord) => void; onPrintTemplate: (template: WorkoutTemplateRecord) => void; onSeedGeneralPrograms: () => void }) {
  const empty = templates.length === 0 && workouts.length === 0;
  const [audienceFilter, setAudienceFilter] = useState<"Todos" | WorkoutTemplateAudience>("Todos");
  const [levelFilter, setLevelFilter] = useState<"Todos" | WorkoutLevel>("Todos");
  const filteredTemplates = templates.filter((template) => (audienceFilter === "Todos" || (template.audience ?? "Geral") === audienceFilter) && (levelFilter === "Todos" || (template.level ?? "Fundação") === levelFilter));
  const orderedTemplates = [...filteredTemplates].sort((first, second) => {
    const dayDifference = workoutTemplateDayOrder.indexOf(first.scheduleDay ?? "Flexível") - workoutTemplateDayOrder.indexOf(second.scheduleDay ?? "Flexível");
    if (dayDifference !== 0) return dayDifference;
    const levelDifference = workoutLevelOrder.indexOf(first.level ?? "Fundação") - workoutLevelOrder.indexOf(second.level ?? "Fundação");
    if (levelDifference !== 0) return levelDifference;
    return first.name.localeCompare(second.name, "pt-BR");
  });
  const renderTemplate = (template: WorkoutTemplateRecord) => {
    const audience = template.audience ?? "Geral";
    const level = template.level ?? "Fundação";
    const day = template.scheduleDay ?? "Flexível";
    const focus = template.focusLabel ?? (template.name.includes(" · ") ? template.name.split(" · ").slice(-1)[0] : "Treino programado");
    const target = audience === "Personalizado" && template.targetStudentName ? ` · ${template.targetStudentName}` : "";
    return <div className="published-template-row" key={template.id}><div className="published-template-copy"><strong>{template.name}</strong><div className="published-template-meta"><span className={`template-chip template-chip-level level-${machineCode(level)}`}><Trophy size={12} /> {level}</span><span className="template-chip template-chip-day"><CalendarDays size={12} /> {day}</span><span className="template-chip template-chip-focus"><Dumbbell size={12} /> {focus}</span><span className={audience === "Personalizado" ? "template-chip template-chip-audience personalized" : "template-chip template-chip-audience"}><Users size={12} /> {audience}</span><span className="template-chip template-chip-count"><ClipboardList size={12} /> {template.exerciseIds.length} exercícios</span></div>{target && <small className="published-template-target"><UserRoundCheck size={12} /> Direcionado para{target}</small>}</div><div className="published-item-actions"><button type="button" onClick={() => onPreviewTemplate(template)}><Eye size={13} /> Visualizar</button><button type="button" onClick={() => onPrintTemplate(template)}><Printer size={13} /> Imprimir</button><button type="button" onClick={() => onEditTemplate(template)}>Editar</button><button type="button" onClick={() => onRemoveTemplate(template)}>Excluir</button></div></div>;
  };
  return <details className="workspace-panel published-workouts training-collapsible-card"><summary className="training-card-summary"><span><small>4 · MODELOS E PUBLICADOS</small><strong>{templates.length} modelos · {workouts.length} fichas enviadas</strong><em>Use filtros para encontrar rapidamente um programa geral ou personalizado.</em></span><ChevronDown /></summary><div className="training-card-content">{empty ? <div className="directory-empty"><Dumbbell /><p>Crie um programa-base para reutilizá-lo com novos alunos.</p></div> : <><div className="published-list-toolbar"><label>Mostrar<select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value as "Todos" | WorkoutTemplateAudience)}><option value="Todos">Todos os modelos</option><option value="Geral">Somente gerais</option><option value="Personalizado">Somente personalizados</option></select></label><label>Nível<select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as "Todos" | WorkoutLevel)}><option value="Todos">Todos os níveis</option><option>Fundação</option><option>Evolução</option><option>Performance</option><option>Elite</option></select></label><button className="detail-secondary" type="button" onClick={onSeedGeneralPrograms}>Criar grade geral · 28 programas</button></div><div className="published-list">{orderedTemplates.length > 0 ? orderedTemplates.map(renderTemplate) : <div className="published-list-empty"><Dumbbell /><p>Nenhum modelo encontrado com esses filtros.</p></div>}</div>{workouts.length > 0 && <details className="published-sent-list"><summary><span>Fichas já enviadas</span><strong>{workouts.length}</strong><ChevronDown /></summary><div className="published-list">{workouts.map((workout) => <div className="published-template-row" key={workout.id}><div><strong>{workout.name}</strong><small>{workout.studentName} · {workout.exerciseIds.length} exercícios</small></div><div className="published-item-actions"><em>Enviado</em><button type="button" onClick={() => onPreviewWorkout(workout)}><Eye size={13} /> Visualizar</button><button type="button" onClick={() => printWorkoutSheet(workout)}><Printer size={13} /> Imprimir</button><button type="button" onClick={() => onEditWorkout(workout)}>Editar</button><button type="button" onClick={() => onRemoveWorkout(workout)}>Excluir</button></div></div>)}</div></details>}</>}</div></details>;
}

function GifLibraryImporter({ onFeedback }: { onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  type GifImportProgress = { total: number; done: number; skipped: number; failed: number; current: string; status: "running" | "completed" | "interrupted" };
  const progressStorageKey = "orquestra-fit:gif-import-progress";
  const [progress, setProgress] = useState<GifImportProgress | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(progressStorageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as GifImportProgress;
      if (!parsed?.total) return;
      setProgress(parsed);
      const completed = parsed.done + parsed.skipped;
      setNotice(parsed.status === "completed"
        ? `Última importação: ${parsed.done} enviados, ${parsed.skipped} já existentes e ${parsed.failed} falharam.`
        : `Importação interrompida em ${completed} de ${parsed.total}. Selecione a pasta novamente para continuar; os arquivos já enviados serão pulados.`);
    } catch {
      // O progresso é apenas uma ajuda visual; nunca deve impedir a tela de abrir.
    }
  }, []);
  useEffect(() => {
    if (!running) return;
    function warnBeforeReload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
      try {
        const saved = window.localStorage.getItem(progressStorageKey);
        if (saved) window.localStorage.setItem(progressStorageKey, JSON.stringify({ ...JSON.parse(saved), status: "interrupted" }));
      } catch {
        // Ignore storage failures while preserving the upload flow.
      }
    }
    window.addEventListener("beforeunload", warnBeforeReload);
    return () => window.removeEventListener("beforeunload", warnBeforeReload);
  }, [running]);
  function saveProgress(next: GifImportProgress) {
    setProgress(next);
    try { window.localStorage.setItem(progressStorageKey, JSON.stringify(next)); } catch { /* ignore quota/private mode errors */ }
  }
  function selectFolder(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).filter((file) => file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif"));
    event.target.value = "";
    setFiles(selected);
    setProgress(null);
    const message = selected.length ? `${selected.length} GIFs selecionados. Clique em Importar uma vez para iniciar.` : "Nenhum GIF foi encontrado. Escolha uma pasta ou arquivos com extensão .gif.";
    setNotice(message);
    onFeedback(message);
  }
  function relativeLibraryPath(file: File) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = relative.replace(/\\/g, "/").split("/").filter(Boolean);
    const profileIndex = parts.findIndex((part) => part.toLocaleUpperCase("pt-BR") === "MASCULINO" || part.toLocaleUpperCase("pt-BR") === "FEMININO");
    if (profileIndex >= 0) {
      const profile = parts[profileIndex].toLocaleUpperCase("pt-BR");
      const profileParts = parts.slice(profileIndex + 1);
      // A pasta-mãe pode conter MASCULINO/FEMININO -> ACADEMIA -> equipamento.
      // O catálogo publicado usa FEMININO como prefixo e, para o masculino,
      // usa o caminho da academia diretamente.
      if (profileParts[0]?.toLocaleUpperCase("pt-BR") === "ACADEMIA") profileParts.shift();
      return profile === "FEMININO" ? [profile, ...profileParts].join("/") : profileParts.join("/");
    }
    const rootIndex = parts.findIndex((part) => part.startsWith("EXERCÍCIOS ") || part === "KETTLEBELL" || part === "SUPERBAND" || part === "CARDIO");
    return parts.slice(rootIndex >= 0 ? rootIndex : Math.max(parts.length - 1, 0)).join("/");
  }
  function libraryPathCandidates(file: File, normalizedPath: string) {
    const raw = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, "/").replace(/^\/+/, "");
    const candidates = new Set<string>([normalizedPath, raw]);
    if (normalizedPath.startsWith("FEMININO/")) {
      const withoutProfile = normalizedPath.slice("FEMININO/".length);
      candidates.add(`FEMININO/ACADEMIA/${withoutProfile}`);
      candidates.add(withoutProfile);
    } else {
      candidates.add(`ACADEMIA/${normalizedPath}`);
      candidates.add(`MASCULINO/ACADEMIA/${normalizedPath}`);
    }
    return Array.from(candidates).filter(Boolean);
  }
  async function importLibrary() {
    if (!storage || access.accountType !== "developer") { onFeedback("A importação da biblioteca é exclusiva da conta desenvolvedora."); return; }
    if (!files.length) { const message = "Selecione a pasta com os GIFs primeiro. O botão só inicia após encontrar arquivos .gif."; setNotice(message); onFeedback(message); return; }
    setRunning(true);
    setNotice(`Iniciando envio de ${files.length} GIFs. Arquivos já importados serão pulados.`);
    let done = 0; let skipped = 0; let failed = 0;
    const knownPaths = new Set<string>();
    saveProgress({ total: files.length, done, skipped, failed, current: files[0]?.name ?? "", status: "running" });
    for (const file of files) {
      const relativePath = relativeLibraryPath(file);
      const candidates = libraryPathCandidates(file, relativePath);
      const target = storageRef(storage, gifLibraryStoragePath(relativePath));
      saveProgress({ total: files.length, done, skipped, failed, current: `Verificando duplicidade · ${relativePath}`, status: "running" });
      try {
        const handledPath = candidates.find((candidate) => knownPaths.has(candidate));
        if (handledPath) {
          skipped += 1;
        } else {
          let existingPath = "";
          for (const candidate of candidates) {
            try { await getDownloadURL(storageRef(storage, gifLibraryStoragePath(candidate))); existingPath = candidate; break; }
            catch (error) {
              if ((error as { code?: string })?.code === "storage/unauthorized") throw error;
            }
          }
          if (existingPath) {
            skipped += 1;
          } else {
          if (file.size > 25 * 1024 * 1024) throw new Error("acima de 25 MB");
          await uploadBytes(target, file, { contentType: "image/gif", customMetadata: { source: "orquestra-fit-library", originalPath: relativePath } });
          done += 1;
          }
        }
        candidates.forEach((candidate) => knownPaths.add(candidate));
      } catch (error) {
        failed += 1;
        onFeedback(`${file.name}: ${error instanceof Error ? error.message : "falha no envio"}.`);
      }
      saveProgress({ total: files.length, done, skipped, failed, current: relativePath, status: "running" });
    }
    setRunning(false);
    const message = `Biblioteca concluída: ${done} enviados, ${skipped} já existentes e ${failed} falharam.`;
    saveProgress({ total: files.length, done, skipped, failed, current: "Concluído", status: "completed" });
    setNotice(message);
    onFeedback(message);
  }
  if (access.accountType !== "developer") return null;
  return <section className="workspace-panel gif-library-importer gif-library-importer-footer"><header><div><span>BIBLIOTECA GLOBAL</span><h3>Importação única dos GIFs</h3><p>Ferramenta técnica do desenvolvedor. O pacote fica no Firebase Storage e poderá ser usado por todas as academias. A gestora não precisará repetir esse envio.</p></div></header><div className="gif-library-import-actions"><label className="detail-secondary">Escolher pasta ou arquivos GIF<input type="file" accept="image/gif,.gif" multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={selectFolder} disabled={running} /></label><button className="detail-save" type="button" onClick={() => void importLibrary()} disabled={running}>{running ? "Importando biblioteca..." : files.length ? "Importar uma vez" : "Selecionar GIFs primeiro"}</button></div>{notice && <small className="gif-library-notice" role="status">{notice}</small>}{files.length > 0 && <small className="panel-helper">{files.length} GIFs selecionados. Os arquivos já enviados serão ignorados.</small>}{progress && <div className="gif-library-progress"><div><strong>{progress.done + progress.skipped} de {progress.total}</strong><span>{progress.status === "running" ? `${progress.failed} falhas · ${progress.current}` : progress.status === "completed" ? `${progress.done} enviados · ${progress.skipped} já existentes · ${progress.failed} falhas` : `interrompido · ${progress.failed} falhas`}</span></div><div className="gif-library-progress-track"><i style={{ width: `${Math.round(((progress.done + progress.skipped) / Math.max(progress.total, 1)) * 100)}%` }} /></div></div>}</section>;
}

function TrainingModule({ onFeedback, initialStudentId = "" }: { onFeedback: (message: string) => void; initialStudentId?: string }) {
  const access = useAccess();
  const [students, setStudents] = useState<BillingStudent[]>([]);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [stockMachines, setStockMachines] = useState<Array<{ id: string; name: string; machineCode?: string }>>([]);
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplateRecord[]>([]);
  const [exerciseSnapshotReady, setExerciseSnapshotReady] = useState(false);
  const [librarySyncAttempted, setLibrarySyncAttempted] = useState(false);
  const autoLinkedExerciseIds = useRef(new Set<string>());
  const [exerciseName, setExerciseName] = useState("");
  const [exerciseEquipment, setExerciseEquipment] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [secondaryMuscles, setSecondaryMuscles] = useState("");
  const [anatomyRegion, setAnatomyRegion] = useState("");
  const [instructions, setInstructions] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [gifFile, setGifFile] = useState<File | null>(null);
  const [selectedCatalogGif, setSelectedCatalogGif] = useState<SelectedCatalogGif | null>(null);
  const [gifProfile, setGifProfile] = useState<"masculino" | "feminino">("masculino");
  const [uploadingGif, setUploadingGif] = useState(false);
  const [syncingVerifiedGifs, setSyncingVerifiedGifs] = useState(false);
  const [gifSyncProgress, setGifSyncProgress] = useState<{ total: number; completed: number; failed: number; current: string } | null>(null);
  const [gifSyncErrors, setGifSyncErrors] = useState<string[]>([]);
  const [gifCatalogOpen, setGifCatalogOpen] = useState(false);
  const [bodyRegion, setBodyRegion] = useState<BodyRegion>("Membros superiores");
  const [phase, setPhase] = useState<ExercisePhase>("Treino principal");
  const [exerciseType, setExerciseType] = useState<ExerciseType>("Força");
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [workoutName, setWorkoutName] = useState("");
  const [workoutLevel, setWorkoutLevel] = useState<WorkoutLevel>("Fundação");
  const [templateAudience, setTemplateAudience] = useState<WorkoutTemplateAudience>("Geral");
  const [templateDay, setTemplateDay] = useState<WorkoutTemplateDay>("Flexível");
  const [studentId, setStudentId] = useState(initialStudentId);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [exerciseDetails, setExerciseDetails] = useState<Record<string, Omit<WorkoutExerciseDetail, "exerciseId" | "name">>>({});
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exercisePreview, setExercisePreview] = useState<{ exercise: ExerciseRecord; detail?: Omit<WorkoutExerciseDetail, "exerciseId" | "name"> } | null>(null);
  const [workoutPreview, setWorkoutPreview] = useState<{ title: string; selectedExercises: string[]; exerciseDetails: Record<string, Omit<WorkoutExerciseDetail, "exerciseId" | "name">> } | null>(null);

  useEffect(() => {
    if (!db) {
      setStudents(readLocalCollection<BillingStudent>(access.academyId, "students"));
      setExercises(readLocalCollection<ExerciseRecord>(access.academyId, "exercises"));
      setStockMachines(readLocalCollection<{ id: string; name: string; kind?: string; machineCode?: string }>(access.academyId, "stockItems").filter((item) => item.kind === "machine"));
      setExerciseSnapshotReady(true);
      setWorkouts(readLocalCollection<WorkoutRecord>(access.academyId, "workouts"));
      setTemplates(readLocalCollection<WorkoutTemplateRecord>(access.academyId, "workoutTemplates"));
      return;
    }
    const academy = ["academies", access.academyId];
    const studentsRef = collection(db, "academies", access.academyId, "students");
    const studentsQuery = access.role === "teacher" ? query(studentsRef, where("teacherId", "==", access.userId)) : studentsRef;
    const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
      setStudents(snapshot.docs.map((student) => { const data = student.data() as { name?: string; active?: boolean; userId?: string | null; authUid?: string | null; uid?: string | null; teacherId?: string | null }; return { id: student.id, userId: data.userId ?? data.authUid ?? data.uid ?? student.id, name: data.name ?? "Aluno sem nome", active: data.active !== false, teacherId: data.teacherId ?? null }; }));
    });
    const unsubscribeExercises = onSnapshot(collection(db, "academies", access.academyId, "exercises"), (snapshot) => {
      setExercises(snapshot.docs.map((exercise) => { const data = exercise.data() as Omit<ExerciseRecord, "id">; const name = data.name ?? "Exercício"; const muscleGroup = data.muscleGroup ?? "Geral"; const fallback = starterClassification(name, muscleGroup); const equipmentName = data.equipmentName || equipmentForExercise(name); return { id: exercise.id, name, muscleGroup, secondaryMuscles: data.secondaryMuscles ?? "", anatomyRegion: data.anatomyRegion ?? "", instructions: data.instructions ?? "", videoUrl: data.videoUrl ?? "", gifUrl: data.gifUrl ?? "", gifPath: data.gifPath ?? "", gifMaleUrl: data.gifMaleUrl ?? "", gifMalePath: data.gifMalePath ?? "", gifFemaleUrl: data.gifFemaleUrl ?? "", gifFemalePath: data.gifFemalePath ?? "", gifMatch: data.gifMatch, equipmentName, machineCode: data.machineCode || machineCode(equipmentName), bodyRegion: data.bodyRegion ?? fallback.bodyRegion, phase: data.phase ?? fallback.phase, exerciseType: data.exerciseType ?? fallback.exerciseType }; }));
      setExerciseSnapshotReady(true);
    });
    const unsubscribeMachines = onSnapshot(query(collection(db, "academies", access.academyId, "stockItems"), where("kind", "==", "machine")), (snapshot) => setStockMachines(snapshot.docs.map((item) => { const data = item.data() as { name?: string; machineCode?: string }; return { id: item.id, name: data.name ?? "Máquina", machineCode: data.machineCode }; })));
    const unsubscribeWorkouts = onSnapshot(collection(db, "academies", access.academyId, "workouts"), (snapshot) => {
      setWorkouts(snapshot.docs.map((workout) => { const data = workout.data() as Omit<WorkoutRecord, "id">; return { id: workout.id, ...data, exerciseIds: data.exerciseIds ?? [], exerciseDetails: data.exerciseDetails ?? [], status: data.status === "draft" ? "draft" : "published" }; }));
    });
    const unsubscribeTemplates = onSnapshot(collection(db, "academies", access.academyId, "workoutTemplates"), (snapshot) => {
      const normalizedTemplates = snapshot.docs.map((template) => { const data = template.data() as Omit<WorkoutTemplateRecord, "id">; return { id: template.id, ...data, exerciseIds: data.exerciseIds ?? [], exerciseDetails: data.exerciseDetails ?? [] }; });
      setTemplates(normalizedTemplates);
      const legacyTemplates = snapshot.docs.filter((template) => !template.data().audience);
      if (legacyTemplates.length && (access.role === "admin" || access.role === "teacher")) {
        void Promise.all(legacyTemplates.map((template) => updateDoc(doc(db!, "academies", access.academyId, "workoutTemplates", template.id), { audience: "Geral", scheduleDay: "Flexível", targetStudentId: null, targetStudentName: null }))).catch(() => undefined);
      }
    });
    return () => { void academy; unsubscribeStudents(); unsubscribeExercises(); unsubscribeMachines(); unsubscribeWorkouts(); unsubscribeTemplates(); };
  }, [access.academyId, access.role, access.userId]);

  useEffect(() => {
    if (!db || !workouts.length || !students.length || !["admin", "teacher"].includes(access.role)) return;
    const studentByRecordId = new Map(students.map((student) => [student.id, student]));
    const legacyLinks = workouts.filter((workout) => {
      const student = studentByRecordId.get(workout.studentId);
      const studentUserId = student?.userId ?? student?.id;
      return Boolean(student && studentUserId && (workout.studentId !== studentUserId || !workout.studentUserId || !workout.studentRecordId));
    });
    if (!legacyLinks.length) return;
    void Promise.all(legacyLinks.map((workout) => {
      const student = studentByRecordId.get(workout.studentId);
      const studentUserId = student?.userId ?? student?.id;
      if (!student || !studentUserId) return Promise.resolve();
      return updateDoc(doc(db!, "academies", access.academyId, "workouts", workout.id), {
        studentId: studentUserId,
        studentUserId,
        studentRecordId: student.id,
        migratedAt: serverTimestamp(),
        migratedBy: access.userId,
      }).catch(() => undefined);
    }));
  }, [access.academyId, access.role, access.userId, students, workouts]);

  async function createExerciseLegacy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !exerciseName.trim() || !muscleGroup.trim()) return;
    try {
      const equipmentName = exerciseEquipment.trim() || equipmentForExercise(exerciseName.trim());
      const selectedMachine = stockMachines.find((machine) => machine.name === exerciseEquipment);
      await addDoc(collection(db, "academies", access.academyId, "exercises"), { name: exerciseName.trim(), muscleGroup: muscleGroup.trim(), equipmentName, machineCode: machineCode(equipmentName), bodyRegion: "Membros superiores", phase: "Treino principal", exerciseType: "Força", createdBy: access.userId, createdAt: serverTimestamp() });
      setExerciseName(""); setExerciseEquipment(""); setMuscleGroup(""); setSecondaryMuscles(""); setAnatomyRegion(""); setInstructions(""); setVideoUrl(""); onFeedback("Exercício cadastrado.");
    } catch { onFeedback("Não foi possível cadastrar o exercício."); }
  }

  function openTrainingCard(selector: string) {
    const card = document.querySelector<HTMLDetailsElement>(selector);
    if (card) card.open = true;
    window.requestAnimationFrame(() => (card ?? document.querySelector<HTMLElement>(selector))?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function editExercise(exercise: ExerciseRecord) {
    setEditingExerciseId(exercise.id); setExerciseName(exercise.name); setExerciseEquipment(exercise.equipmentName ?? equipmentForExercise(exercise.name)); setMuscleGroup(exercise.muscleGroup); setSecondaryMuscles(exercise.secondaryMuscles ?? ""); setAnatomyRegion(exercise.anatomyRegion ?? ""); setInstructions(exercise.instructions ?? ""); setVideoUrl(exercise.videoUrl ?? ""); setGifFile(null); setSelectedCatalogGif(null); setGifProfile(exercise.gifFemaleUrl && !exercise.gifMaleUrl && !exercise.gifUrl ? "feminino" : "masculino"); setBodyRegion(exercise.bodyRegion ?? "Membros superiores"); setPhase(exercise.phase ?? "Treino principal"); setExerciseType(exercise.exerciseType ?? "Força");
    openTrainingCard("details.exercise-library-panel");
  }

  function linkExerciseGif(exercise: ExerciseRecord) {
    editExercise(exercise);
    window.requestAnimationFrame(() => setGifCatalogOpen(true));
  }

  function clearExerciseForm() {
    setEditingExerciseId(null); setExerciseName(""); setExerciseEquipment(""); setMuscleGroup(""); setSecondaryMuscles(""); setAnatomyRegion(""); setInstructions(""); setVideoUrl(""); setGifFile(null); setSelectedCatalogGif(null); setGifProfile("masculino"); setBodyRegion("Membros superiores"); setPhase("Treino principal"); setExerciseType("Força");
  }

  async function fileAsBase64(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    return btoa(binary);
  }

  async function uploadExerciseGif(exerciseId: string) {
    if (selectedCatalogGif?.profile === gifProfile) {
      return gifProfile === "feminino"
        ? { gifFemaleUrl: selectedCatalogGif.url, gifFemalePath: selectedCatalogGif.path }
        : { gifUrl: selectedCatalogGif.url, gifPath: selectedCatalogGif.path, gifMaleUrl: selectedCatalogGif.url, gifMalePath: selectedCatalogGif.path };
    }
    if (!gifFile) return null;
    if (!functions) throw new Error("O serviço seguro de mídia não está configurado.");
    if (gifFile.type !== "image/gif") throw new Error("Selecione um arquivo GIF.");
    if (gifFile.size > 10 * 1024 * 1024) throw new Error("O GIF deve ter no máximo 10 MB.");
    const result = await httpsCallable<{ academyId: string; exerciseId: string; fileName: string; contentType: string; base64: string; profile: "masculino" | "feminino" }, { ok: boolean; path: string; url: string }>(functions, "uploadExerciseGif")({ academyId: access.academyId, exerciseId, fileName: gifFile.name, contentType: gifFile.type, profile: gifProfile, base64: await fileAsBase64(gifFile) });
    const { path, url } = result.data;
    return gifProfile === "feminino" ? { gifFemaleUrl: url, gifFemalePath: path } : { gifUrl: url, gifPath: path, gifMaleUrl: url, gifMalePath: path };
  }

  async function chooseGifFromCatalog(item: GifCatalogItem) {
    try {
      setGifProfile(item.profile);
      let sourceUrl = item.url;
      let globalPath = "";
      if (storage) {
        globalPath = gifLibraryStoragePath(item.file);
        try { sourceUrl = await getDownloadURL(storageRef(storage, globalPath)); } catch { globalPath = ""; /* usa a fonte do catálogo enquanto a biblioteca não foi importada */ }
      }
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error("Não foi possível abrir este GIF.");
      if (globalPath) {
        setGifFile(null);
        setSelectedCatalogGif({ url: sourceUrl, path: globalPath, profile: item.profile });
        setGifCatalogOpen(false);
        onFeedback("GIF global selecionado. Salve o exercício para vincular sem novo envio.");
        return;
      }
      const file = new File([await response.blob()], item.file.split("/").pop() || "demonstracao.gif", { type: "image/gif" });
      setGifFile(file);
      setSelectedCatalogGif(null);
      setGifCatalogOpen(false);
      onFeedback("GIF selecionado. Salve as alterações para vinculá-lo ao exercício.");
    } catch { onFeedback("Não foi possível selecionar o GIF da biblioteca."); }
  }

  async function syncVerifiedGifLibrary() {
    if (!db || !functions || access.role !== "admin") { onFeedback("Entre como gestão no ambiente local para enviar a biblioteca revisada."); return; }
    const pending = exercises.filter((exercise) => Boolean(verifiedExerciseGifs[exerciseGifKey(exercise.name)]) && !exercise.gifMaleUrl && !exercise.gifUrl);
    if (!pending.length) { onFeedback("Todos os GIFs revisados já foram enviados para a biblioteca da academia."); return; }
    if (!window.confirm(`Enviar ${pending.length} GIFs revisados ao Firebase Storage? Isso os disponibiliza também na Vercel e no celular.`)) return;
    setSyncingVerifiedGifs(true);
    setGifSyncErrors([]);
    setGifSyncProgress({ total: pending.length, completed: 0, failed: 0, current: pending[0]?.name ?? "" });
    let completed = 0;
    let failed = 0;
    for (const exercise of pending) {
      setGifSyncProgress({ total: pending.length, completed, failed, current: exercise.name });
      try {
        const source = verifiedExerciseGif(exercise.name);
        const response = await fetch(source);
        if (!response.ok) throw new Error("Arquivo local indisponível");
        const file = new File([await response.blob()], source.split("/").pop() || "demonstracao.gif", { type: "image/gif" });
        if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo acima do limite");
        if (!functions) throw new Error("O serviço seguro de mídia não está configurado.");
        const result = await httpsCallable<{ academyId: string; exerciseId: string; fileName: string; contentType: string; base64: string; profile: "masculino" }, { ok: boolean; path: string; url: string }>(functions, "uploadExerciseGif")({ academyId: access.academyId, exerciseId: exercise.id, fileName: file.name, contentType: "image/gif", profile: "masculino", base64: await fileAsBase64(file) });
        const { path, url } = result.data;
        await updateDoc(doc(db, "academies", access.academyId, "exercises", exercise.id), { gifUrl: url, gifPath: path, gifMaleUrl: url, gifMalePath: path, updatedAt: serverTimestamp(), updatedBy: access.userId });
        completed += 1;
      } catch (error) {
        failed += 1;
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        const message = code === "storage/unauthorized"
          ? "Sem permissão no Firebase Storage para esta conta de gestão."
          : code === "storage/unauthenticated"
            ? "Sua sessão expirou. Entre novamente no sistema."
            : code === "storage/quota-exceeded"
              ? "O limite do Firebase Storage foi atingido."
              : code === "storage/retry-limit-exceeded"
                ? "A conexão caiu durante o envio."
                : error instanceof Error ? error.message : "Falha desconhecida no envio.";
        setGifSyncErrors((current) => [...current, `${exercise.name}: ${message}`].slice(-3));
      }
      setGifSyncProgress({ total: pending.length, completed, failed, current: exercise.name });
    }
    setSyncingVerifiedGifs(false);
    setGifSyncProgress({ total: pending.length, completed, failed, current: "Concluído" });
    onFeedback(failed ? `${completed} GIFs enviados; ${failed} precisam de revisão.` : `${completed} GIFs revisados enviados para a academia.`);
  }

  async function createExercise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exerciseName.trim() || !muscleGroup.trim()) {
      onFeedback("Informe o nome e o grupo muscular do exercício.");
      return;
    }
    if (!db) {
      const fallback = starterClassification(exerciseName.trim(), muscleGroup.trim());
      const equipmentName = exerciseEquipment.trim() || equipmentForExercise(exerciseName.trim());
      const selectedMachine = stockMachines.find((machine) => machine.name === exerciseEquipment);
      const existingExercise = editingExerciseId ? exercises.find((item) => item.id === editingExerciseId) : undefined;
      const localExercise: ExerciseRecord = {
        ...existingExercise,
        id: editingExerciseId ?? `local-exercise-${Date.now()}`,
        name: capitalizeName(exerciseName.trim()),
        muscleGroup: capitalizeName(muscleGroup.trim()),
        ...fallback,
        secondaryMuscles: secondaryMuscles.trim(),
        anatomyRegion: anatomyRegion.trim(),
        instructions: instructions.trim(),
        videoUrl: videoUrl.trim(),
        equipmentName,
        machineCode: selectedMachine?.machineCode || machineCode(equipmentName),
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
    const equipmentName = exerciseEquipment.trim() || equipmentForExercise(exerciseName.trim());
    const selectedMachine = stockMachines.find((machine) => machine.name === exerciseEquipment);
    const data = { name: exerciseName.trim(), muscleGroup: muscleGroup.trim(), secondaryMuscles: secondaryMuscles.trim(), anatomyRegion: anatomyRegion.trim(), instructions: instructions.trim(), videoUrl: videoUrl.trim(), equipmentName, machineCode: selectedMachine?.machineCode || machineCode(equipmentName), bodyRegion, phase, exerciseType, updatedBy: access.userId, updatedAt: serverTimestamp() };
    try {
      setUploadingGif(Boolean(gifFile));
      if (editingExerciseId) {
        const media = await uploadExerciseGif(editingExerciseId);
        await updateDoc(doc(db, "academies", access.academyId, "exercises", editingExerciseId), media ? { ...data, ...media } : data);
        onFeedback("Exercício atualizado.");
      } else {
        const created = await addDoc(collection(db, "academies", access.academyId, "exercises"), { ...data, createdBy: access.userId, createdAt: serverTimestamp() });
        const media = await uploadExerciseGif(created.id);
        if (media) await updateDoc(created, media);
        onFeedback("Exercício cadastrado.");
      }
      clearExerciseForm();
    } catch (error) { onFeedback(error instanceof Error ? error.message : "Não foi possível salvar o exercício."); } finally { setUploadingGif(false); }
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
      const seeded = starterExercises.map(([name, muscleGroup, secondaryMuscles, anatomyRegion], index) => { const equipmentName = equipmentForExercise(name); return { id: `local-starter-${index}`, name, muscleGroup, secondaryMuscles, anatomyRegion, equipmentName, machineCode: machineCode(equipmentName), instructions: "Orientação objetiva será adicionada pelo professor.", videoUrl: "", ...starterClassification(name, muscleGroup) }; });
      const nextExercises = exercises.length ? exercises : seeded;
      setExercises(nextExercises);
      writeLocalCollection(access.academyId, "exercises", nextExercises);
      onFeedback(exercises.length ? "A biblioteca inicial já foi carregada." : `${seeded.length} exercícios adicionados no modo local.`);
      return;
    }
    const firestore = db;
    const existingNames = new Set(exercises.map((exercise) => exercise.name.trim().toLocaleLowerCase("pt-BR")));
    const pending = starterExercises.filter(([name]) => !existingNames.has(name.toLocaleLowerCase("pt-BR")));
    const batch = writeBatch(firestore);
    exercises.forEach((exercise) => {
      const equipmentName = exercise.equipmentName || equipmentForExercise(exercise.name);
      batch.set(doc(firestore, "academies", access.academyId, "exercises", exercise.id), { equipmentName, machineCode: exercise.machineCode || machineCode(equipmentName) }, { merge: true });
    });
    pending.forEach(([name, primary, secondary, region]) => {
      const exerciseRef = doc(collection(firestore, "academies", access.academyId, "exercises"));
      const classification = starterClassification(name, primary);
      const equipmentName = equipmentForExercise(name);
      batch.set(exerciseRef, { name, muscleGroup: primary, secondaryMuscles: secondary, anatomyRegion: region, equipmentName, machineCode: machineCode(equipmentName), instructions: "Orientação objetiva será adicionada pelo professor.", videoUrl: "", ...classification, createdBy: access.userId, createdAt: serverTimestamp(), source: "starter-library" });
    });
    try {
      await batch.commit();
      onFeedback(pending.length ? `${pending.length} exercícios adicionados e máquinas identificadas.` : "Equipamentos e códigos das máquinas atualizados.");
    } catch {
      onFeedback("Não foi possível carregar a biblioteca inicial.");
    }
  }

  useEffect(() => {
    if (!exerciseSnapshotReady || librarySyncAttempted || !["admin", "teacher"].includes(access.role)) return;
    setLibrarySyncAttempted(true);
    void seedStarterExercises();
  }, [access.role, exerciseSnapshotReady, librarySyncAttempted]);

  useEffect(() => {
    if (!db || !storage || !exerciseSnapshotReady || !["admin", "teacher"].includes(access.role)) return;
    const firestore = db;
    const firebaseStorage = storage;
    const pending = exercises.filter((exercise) => {
      const key = exerciseGifKey(exercise.name);
      const verified = verifiedExerciseGifs[key];
      const needsMale = !exercise.gifMaleUrl && !exercise.gifUrl;
      const needsFemale = Boolean(verifiedFemaleGifUrls[key]) && !exercise.gifFemaleUrl;
      return Boolean(verified) && (needsMale || needsFemale) && !autoLinkedExerciseIds.current.has(exercise.id);
    });
    if (!pending.length) return;
    pending.forEach((exercise) => autoLinkedExerciseIds.current.add(exercise.id));
    void (async () => {
      const resolved = await Promise.all(pending.map(async (exercise) => {
        const key = exerciseGifKey(exercise.name);
        const verified = verifiedExerciseGifs[key];
        if (!verified) return null;
        const femaleUrl = verifiedFemaleGifUrls[key] || verified.femaleUrl || "";
        const existingMaleUrl = exercise.gifMaleUrl || exercise.gifUrl || "";
        const existingMalePath = exercise.gifMalePath || exercise.gifPath || "";
        if (existingMaleUrl) return { exercise, path: existingMalePath, url: existingMaleUrl, femaleUrl };
        try {
          const path = gifLibraryStoragePath(verified.maleFile);
          const url = await getDownloadURL(storageRef(firebaseStorage, path));
          return { exercise, path, url, femaleUrl };
        } catch {
          return femaleUrl ? { exercise, path: "", url: "", femaleUrl } : null;
        }
      }));
      const available = resolved.filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (!available.length) return;
      const batch = writeBatch(firestore);
      available.forEach(({ exercise, path, url, femaleUrl }) => {
        const verified = verifiedExerciseGifs[exerciseGifKey(exercise.name)];
        const mediaPatch = {
          ...(url ? { gifUrl: url, gifMaleUrl: url } : {}),
          ...(path ? { gifPath: path, gifMalePath: path } : {}),
          ...(femaleUrl ? { gifFemaleUrl: femaleUrl } : {}),
        };
        batch.set(doc(firestore, "academies", access.academyId, "exercises", exercise.id), {
          ...mediaPatch,
          gifLinkedFrom: "global-library",
          gifMatch: verified?.match ?? "exact",
          updatedAt: serverTimestamp(),
          updatedBy: access.userId,
        }, { merge: true });
      });
      try {
        await batch.commit();
        onFeedback(`${available.length} GIFs revisados foram vinculados automaticamente.`);
      } catch {
        available.forEach(({ exercise }) => autoLinkedExerciseIds.current.delete(exercise.id));
      }
    })();
  }, [access.academyId, access.role, access.userId, exerciseSnapshotReady, exercises, onFeedback]);

  function toggleExercise(exercise: ExerciseRecord) {
    const selected = selectedExercises.includes(exercise.id);
    setSelectedExercises((current) => selected ? current.filter((id) => id !== exercise.id) : [...current, exercise.id]);
    if (!selected) setExerciseDetails((current) => ({ ...current, [exercise.id]: defaultExerciseDetails(exercise) }));
  }

  function updateExerciseParameter(exerciseId: string, field: "sets" | "reps" | "load" | "rest", value: string) {
    const exercise = exercises.find((item) => item.id === exerciseId);
    const defaults = exercise ? defaultExerciseDetails(exercise) : { sets: "3", reps: "10", load: "0", rest: "60" };
    setExerciseDetails((current) => ({ ...current, [exerciseId]: { sets: current[exerciseId]?.sets ?? defaults.sets, reps: current[exerciseId]?.reps ?? defaults.reps, load: current[exerciseId]?.load ?? defaults.load, rest: current[exerciseId]?.rest ?? defaults.rest, [field]: value } }));
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
      return { exerciseId, name: exercise?.name ?? "Exercício", muscleGroup: exercise?.muscleGroup, secondaryMuscles: exercise?.secondaryMuscles, anatomyRegion: exercise?.anatomyRegion, instructions: exercise?.instructions, videoUrl: exercise?.videoUrl, gifUrl: exercise?.gifUrl, gifPath: exercise?.gifPath, gifMaleUrl: exercise?.gifMaleUrl, gifMalePath: exercise?.gifMalePath, gifFemaleUrl: exercise?.gifFemaleUrl, gifFemalePath: exercise?.gifFemalePath, equipmentName: exercise?.equipmentName || equipmentForExercise(exercise?.name ?? ""), machineCode: exercise?.machineCode, bodyRegion: exercise?.bodyRegion, phase: exercise?.phase, exerciseType: exercise?.exerciseType, ...exerciseDetails[exerciseId] };
    });
    if (!db) {
      const localWorkout: WorkoutRecord = { id: editingWorkoutId ?? `local-workout-${Date.now()}`, name: capitalizeName(workoutName.trim()), studentId, studentRecordId: student.id, studentUserId: student.userId ?? student.id, studentName: student.name, recommendedDay: templateDay, level: workoutLevel, audience: "Personalizado", exerciseIds: selectedExercises, exerciseDetails: details as WorkoutExerciseDetail[], status: "published" };
      const nextWorkouts = editingWorkoutId ? workouts.map((item) => item.id === editingWorkoutId ? localWorkout : item) : [...workouts, localWorkout];
      setWorkouts(nextWorkouts);
      writeLocalCollection(access.academyId, "workouts", nextWorkouts);
      setWorkoutName(""); setWorkoutLevel("Fundação"); setStudentId(""); setSelectedExercises([]); setExerciseDetails({}); setEditingWorkoutId(null);
      onFeedback(editingWorkoutId ? "Treino atualizado no modo local." : "Treino publicado no modo local.");
      return;
    }
    setSaving(true);
    try {
      const studentUserId = student.userId ?? student.id;
      const workoutData = { name: workoutName.trim(), studentId: studentUserId, studentRecordId: student.id, studentUserId, studentName: student.name, recommendedDay: templateDay, level: workoutLevel, audience: "Personalizado" as const, exerciseIds: selectedExercises, exerciseDetails: details, status: "published" as const, updatedBy: access.userId, updatedAt: serverTimestamp() };
      if (editingWorkoutId) {
        await updateDoc(doc(db, "academies", access.academyId, "workouts", editingWorkoutId), workoutData);
        onFeedback("Treino atualizado para o aluno.");
      } else {
        await addDoc(collection(db, "academies", access.academyId, "workouts"), { ...workoutData, createdBy: access.userId, createdAt: serverTimestamp(), publishedAt: serverTimestamp() });
        onFeedback("Treino publicado para o aluno.");
      }
      setWorkoutName(""); setWorkoutLevel("Fundação"); setStudentId(""); setSelectedExercises([]); setExerciseDetails({}); setEditingWorkoutId(null);
    } catch { onFeedback("Não foi possível publicar o treino."); }
    finally { setSaving(false); }
  }

  async function seedGeneralPrograms() {
    if (!exercises.length) {
      onFeedback("Cadastre ou carregue os exercícios antes de criar a grade geral.");
      return;
    }
    const dayFocus: Array<{ day: WorkoutTemplateDay; label: string; focus: string[] }> = [
      { day: "Segunda-feira", label: "Peito + tríceps", focus: ["peito", "tríceps"] },
      { day: "Terça-feira", label: "Costas + bíceps", focus: ["costas", "bíceps"] },
      { day: "Quarta-feira", label: "Quadríceps + pernas", focus: ["quadríceps", "perna"] },
      { day: "Quinta-feira", label: "Ombros + core", focus: ["ombro", "abdômen", "core"] },
      { day: "Sexta-feira", label: "Glúteos + posteriores", focus: ["glúteo", "posterior", "femoral"] },
      { day: "Sábado", label: "Panturrilhas + antebraço", focus: ["panturrilha", "antebraço"] },
      { day: "Domingo", label: "Lombar + mobilidade", focus: ["lombar", "mobilidade", "alongamento"] },
    ];
    const levels: WorkoutLevel[] = ["Fundação", "Evolução", "Performance", "Elite"];
    const preparation = exercises.filter((exercise) => exercise.phase === "Preparação");
    const mainExercises = exercises.filter((exercise) => exercise.phase !== "Preparação");
    const existingKeys = new Set(templates.map((template) => template.seedKey).filter((key): key is string => Boolean(key)));
    const templateExerciseDetails = (exercise: ExerciseRecord): WorkoutExerciseDetail => ({ exerciseId: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup, secondaryMuscles: exercise.secondaryMuscles, anatomyRegion: exercise.anatomyRegion, instructions: exercise.instructions, videoUrl: exercise.videoUrl, gifUrl: exercise.gifUrl, gifPath: exercise.gifPath, gifMaleUrl: exercise.gifMaleUrl, gifMalePath: exercise.gifMalePath, gifFemaleUrl: exercise.gifFemaleUrl, gifFemalePath: exercise.gifFemalePath, equipmentName: exercise.equipmentName, machineCode: exercise.machineCode, bodyRegion: exercise.bodyRegion, phase: exercise.phase, exerciseType: exercise.exerciseType, ...defaultExerciseDetails(exercise) });
    const createdTemplates: WorkoutTemplateRecord[] = [];
    levels.forEach((level, levelIndex) => dayFocus.forEach((day, dayIndex) => {
      const seedKey = `grade-geral-${machineCode(level)}-${machineCode(day.day)}`;
      if (existingKeys.has(seedKey)) return;
      const focusMatches = mainExercises.filter((exercise) => {
        const text = `${exercise.name} ${exercise.muscleGroup} ${exercise.secondaryMuscles ?? ""}`.toLocaleLowerCase("pt-BR");
        return day.focus.some((term) => text.includes(term));
      });
      const fallback = mainExercises.filter((exercise) => !focusMatches.some((item) => item.id === exercise.id));
      const rotation = (levelIndex * 2 + dayIndex) % Math.max(fallback.length, 1);
      const rotatedFallback = fallback.length ? [...fallback.slice(rotation), ...fallback.slice(0, rotation)] : [];
      const selected = [...(preparation.length ? [preparation[(levelIndex + dayIndex) % preparation.length]] : []), ...focusMatches, ...rotatedFallback].filter((exercise, index, list) => list.findIndex((item) => item.id === exercise.id) === index).slice(0, 7);
      createdTemplates.push({ id: `local-template-${seedKey}-${Date.now()}-${levelIndex}-${dayIndex}`, name: day.label, level, audience: "Geral", scheduleDay: day.day, focusLabel: day.label, targetStudentId: null, targetStudentName: null, seedKey, exerciseIds: selected.map((exercise) => exercise.id), exerciseDetails: selected.map(templateExerciseDetails), createdBy: access.userId });
    }));
    if (!createdTemplates.length) {
      onFeedback("A grade de 28 programas já foi criada. Nenhum duplicado foi adicionado.");
      return;
    }
    if (!db) {
      const nextTemplates = [...templates, ...createdTemplates];
      setTemplates(nextTemplates);
      writeLocalCollection(access.academyId, "workoutTemplates", nextTemplates);
      onFeedback(`${createdTemplates.length} programas gerais criados no modo local.`);
      return;
    }
    setSaving(true);
    try {
      await Promise.all(createdTemplates.map((template) => addDoc(collection(db!, "academies", access.academyId, "workoutTemplates"), { name: template.name, level: template.level, audience: template.audience, scheduleDay: template.scheduleDay, focusLabel: template.focusLabel, targetStudentId: null, targetStudentName: null, seedKey: template.seedKey, exerciseIds: template.exerciseIds, exerciseDetails: template.exerciseDetails, createdBy: access.userId, updatedBy: access.userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));
      onFeedback(`${createdTemplates.length} programas gerais criados na biblioteca.`);
    } catch {
      onFeedback("Não foi possível criar toda a grade de programas. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate() {
    if (!workoutName.trim() || selectedExercises.length === 0) {
      onFeedback("Informe o nome e selecione exercícios para salvar o modelo.");
      return;
    }
    if (templateAudience === "Personalizado" && !studentId) {
      onFeedback("Selecione o aluno que receberá o programa personalizado.");
      return;
    }
    const preparationCount = selectedExercises.filter((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId)?.phase === "Preparação").length;
    if (preparationCount < 1 || preparationCount > 3) { onFeedback("Inclua de 1 a 3 exercícios de preparação no modelo."); return; }
    const targetStudent = templateAudience === "Personalizado" ? students.find((student) => student.id === studentId) : undefined;
    if (templateAudience === "Personalizado" && !targetStudent) {
      onFeedback("Não foi possível localizar o aluno do programa personalizado.");
      return;
    }
    const details = selectedExercises.map((exerciseId) => {
      const exercise = exercises.find((item) => item.id === exerciseId);
      return { exerciseId, name: exercise?.name ?? "Exercício", muscleGroup: exercise?.muscleGroup, secondaryMuscles: exercise?.secondaryMuscles, anatomyRegion: exercise?.anatomyRegion, instructions: exercise?.instructions, videoUrl: exercise?.videoUrl, gifUrl: exercise?.gifUrl, gifPath: exercise?.gifPath, gifMaleUrl: exercise?.gifMaleUrl, gifMalePath: exercise?.gifMalePath, gifFemaleUrl: exercise?.gifFemaleUrl, gifFemalePath: exercise?.gifFemalePath, equipmentName: exercise?.equipmentName || equipmentForExercise(exercise?.name ?? ""), machineCode: exercise?.machineCode, bodyRegion: exercise?.bodyRegion, phase: exercise?.phase, exerciseType: exercise?.exerciseType, ...exerciseDetails[exerciseId] };
    });
    if (!db) {
      const localTemplate: WorkoutTemplateRecord = { id: editingTemplateId ?? `local-template-${Date.now()}`, name: capitalizeName(workoutName.trim()), level: workoutLevel, audience: templateAudience, scheduleDay: templateDay, targetStudentId: targetStudent?.id ?? null, targetStudentName: targetStudent?.name ?? null, exerciseIds: selectedExercises, exerciseDetails: details as WorkoutExerciseDetail[], createdBy: access.userId };
      const nextTemplates = editingTemplateId ? templates.map((item) => item.id === editingTemplateId ? localTemplate : item) : [...templates, localTemplate];
      setTemplates(nextTemplates);
      writeLocalCollection(access.academyId, "workoutTemplates", nextTemplates);
      setEditingTemplateId(null);
      onFeedback(editingTemplateId ? "Modelo de treino atualizado no modo local." : "Modelo de treino salvo no modo local.");
      window.requestAnimationFrame(() => scrollToContent(".published-workouts"));
      return;
    }
    setSaving(true);
    try {
      const templateData = { name: workoutName.trim(), level: workoutLevel, audience: templateAudience, scheduleDay: templateDay, targetStudentId: targetStudent?.id ?? null, targetStudentName: targetStudent?.name ?? null, exerciseIds: selectedExercises, exerciseDetails: details, updatedBy: access.userId, updatedAt: serverTimestamp() };
      if (editingTemplateId) {
        await updateDoc(doc(db, "academies", access.academyId, "workoutTemplates", editingTemplateId), templateData);
        onFeedback("Modelo de treino atualizado.");
      } else {
        await addDoc(collection(db, "academies", access.academyId, "workoutTemplates"), { ...templateData, createdBy: access.userId, createdAt: serverTimestamp() });
        onFeedback("Modelo de treino salvo na biblioteca.");
      }
      setEditingTemplateId(null);
      window.requestAnimationFrame(() => scrollToContent(".published-workouts"));
    } catch { onFeedback("Não foi possível salvar o modelo."); }
    finally { setSaving(false); }
  }

  function loadTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingTemplateId(null); setEditingWorkoutId(null);
    setWorkoutName(template.name);
    setWorkoutLevel(template.level ?? "Fundação");
    setTemplateAudience(template.audience ?? "Geral");
    setTemplateDay(template.scheduleDay ?? "Flexível");
    setStudentId(template.audience === "Personalizado" ? template.targetStudentId ?? "" : "");
    setSelectedExercises(template.exerciseIds);
    setExerciseDetails(Object.fromEntries(template.exerciseDetails.map((detail) => [detail.exerciseId, { sets: detail.sets, reps: detail.reps, load: detail.load, rest: detail.rest }])));
    openTrainingCard("details.workout-builder-panel");
    onFeedback("Modelo carregado. Adapte os dados antes de publicar.");
  }

  function beginTemplateEdit(template: WorkoutTemplateRecord) {
    setEditingTemplateId(template.id); setEditingWorkoutId(null); setWorkoutName(template.name); setWorkoutLevel(template.level ?? "Fundação"); setTemplateAudience(template.audience ?? "Geral"); setTemplateDay(template.scheduleDay ?? "Flexível"); setStudentId(template.audience === "Personalizado" ? template.targetStudentId ?? "" : ""); setSelectedExercises(template.exerciseIds);
    setExerciseDetails(Object.fromEntries(template.exerciseDetails.map((detail) => [detail.exerciseId, { sets: detail.sets, reps: detail.reps, load: detail.load, rest: detail.rest }])));
    openTrainingCard("details.workout-builder-panel"); onFeedback("Modelo carregado para edição.");
  }

  function beginWorkoutEdit(workout: WorkoutRecord) {
    setEditingWorkoutId(workout.id); setEditingTemplateId(null); setWorkoutName(workout.name); setWorkoutLevel(workout.level ?? "Fundação"); setTemplateAudience("Personalizado"); setTemplateDay(workout.recommendedDay ?? "Flexível"); setStudentId(workout.studentRecordId ?? workout.studentId); setSelectedExercises(workout.exerciseIds);
    setExerciseDetails(Object.fromEntries((workout.exerciseDetails ?? []).map((detail) => [detail.exerciseId, { sets: detail.sets, reps: detail.reps, load: detail.load, rest: detail.rest }])));
    openTrainingCard("details.workout-builder-panel"); onFeedback("Treino carregado para edição.");
  }

  function previewTemplate(template: WorkoutTemplateRecord) {
    setWorkoutPreview({ title: template.name, selectedExercises: template.exerciseIds, exerciseDetails: Object.fromEntries(template.exerciseDetails.map((detail) => [detail.exerciseId, { sets: detail.sets, reps: detail.reps, load: detail.load, rest: detail.rest }])) });
  }

  function previewWorkout(workout: WorkoutRecord) {
    setWorkoutPreview({ title: workout.name, selectedExercises: workout.exerciseIds, exerciseDetails: Object.fromEntries((workout.exerciseDetails ?? []).map((detail) => [detail.exerciseId, { sets: detail.sets, reps: detail.reps, load: detail.load, rest: detail.rest }])) });
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

  const linkedGifCount = exercises.filter((exercise) => Boolean(exerciseGifSource(exercise))).length;
  const pendingGifCount = Math.max(0, exercises.length - linkedGifCount);
  const usedGifPaths = exercises.flatMap((exercise) => [exercise.gifPath, exercise.gifMalePath, exercise.gifFemalePath].filter((path): path is string => Boolean(path)));

  return <div className="workspace-content module-view">
    <section className="workspace-intro"><div><span>PRESCRIÇÃO · {access.role === "teacher" ? "PROFESSOR" : "GESTÃO"}</span><h2>Treinos</h2><p>Monte uma ficha por etapas, salve modelos e publique para um aluno quando estiver pronta.</p></div></section>
     {access.role === "admin" && access.accountType !== "developer" && <section className="workspace-panel training-machine-quickselect"><div><strong>Biblioteca de GIFs revisada</strong><small>{linkedGifCount} movimentos prontos para demonstração. Os novos GIFs escolhidos na galeria são enviados automaticamente ao salvar o exercício.</small>{gifSyncProgress && <small className="gif-sync-progress">{gifSyncProgress.current === "Concluído" ? `Concluído: ${gifSyncProgress.completed} enviados${gifSyncProgress.failed ? ` · ${gifSyncProgress.failed} falharam` : ""}.` : `Enviando ${gifSyncProgress.completed + gifSyncProgress.failed + 1} de ${gifSyncProgress.total}: ${gifSyncProgress.current}${gifSyncProgress.failed ? ` · ${gifSyncProgress.failed} falharam` : ""}`}</small>}{gifSyncErrors.map((item) => <small className="gif-sync-error" key={item}>{item}</small>)}</div><button className="detail-secondary" type="button" disabled={syncingVerifiedGifs} onClick={() => void syncVerifiedGifLibrary()}>{syncingVerifiedGifs ? "Enviando GIFs revisados..." : "Sincronizar GIFs já vinculados"}</button></section>}
     {access.role === "admin" && access.accountType !== "developer" && <section className="workspace-panel training-machine-quickselect"><div><strong>Biblioteca de GIFs revisada</strong><small>{linkedGifCount} movimentos prontos para demonstração. Os novos GIFs escolhidos na galeria são enviados automaticamente ao salvar o exercício.</small>{gifSyncProgress && <small className="gif-sync-progress">{gifSyncProgress.current === "Concluído" ? `Concluído: ${gifSyncProgress.completed} enviados${gifSyncProgress.failed ? ` · ${gifSyncProgress.failed} falharam` : ""}.` : `Enviando ${gifSyncProgress.completed + gifSyncProgress.failed + 1} de ${gifSyncProgress.total}: ${gifSyncProgress.current}${gifSyncProgress.failed ? ` · ${gifSyncProgress.failed} falharam` : ""}`}</small>}{gifSyncErrors.map((item) => <small className="gif-sync-error" key={item}>{item}</small>)}</div><button className="detail-secondary" type="button" disabled={syncingVerifiedGifs} onClick={() => void syncVerifiedGifLibrary()}>{syncingVerifiedGifs ? "Enviando GIFs revisados..." : "Sincronizar GIFs já vinculados"}</button></section>}
    <section className="training-layout training-layout-redesigned">
      <details className="workspace-panel training-form-panel workout-builder-panel training-collapsible-card">
        <summary className="training-card-summary"><span><small>1 · PROGRAMA E FICHA</small><strong>Monte uma vez. Use sempre.</strong><em>Crie um programa-base por nível e publique para um aluno quando precisar.</em></span><ChevronDown /></summary>
        <div className="training-card-content">
        <form className="student-detail-form" onSubmit={createWorkout}>
          <div className="workout-builder-fields">
            <label>Começar com programa-base<select defaultValue="" onChange={(event) => loadTemplate(event.target.value)}><option value="">Novo programa do zero</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.audience ?? "Geral"} · {template.level ?? "Fundação"} · {template.name}</option>)}</select></label>
            <label>Nível do programa<select value={workoutLevel} onChange={(event) => setWorkoutLevel(event.target.value as WorkoutLevel)}><option>Fundação</option><option>Evolução</option><option>Performance</option><option>Elite</option></select><small>Fundação para iniciantes, Evolução para nível médio, Performance e Elite para alunos avançados.</small></label>
            <label>Uso do programa<select value={templateAudience} onChange={(event) => setTemplateAudience(event.target.value as WorkoutTemplateAudience)}><option value="Geral">Geral · vários alunos</option><option value="Personalizado">Personalizado · um aluno</option></select><small>Programas gerais ficam disponíveis para a academia. Personalizados ficam vinculados a uma pessoa.</small></label>
            <label>Dia do programa<select value={templateDay} onChange={(event) => setTemplateDay(event.target.value as WorkoutTemplateDay)}>{workoutTemplateDayOptions.map((day) => <option key={day} value={day}>{day}</option>)}</select><small>Use um dia da semana para montar a rotina A/B/C ou deixe flexível.</small></label>
            <label>Nome do programa<input value={workoutName} onChange={(event) => setWorkoutName(event.target.value)} placeholder="Ex.: Fundamentos · Corpo inteiro A" required /></label>
            <label>{templateAudience === "Personalizado" ? "Aluno do programa personalizado" : "Enviar para aluno"} <span className="optional-label">{templateAudience === "Personalizado" ? "obrigatório" : "opcional ao salvar programa-base"}</span><select value={studentId} required={templateAudience === "Personalizado"} onChange={(event) => setStudentId(event.target.value)}><option value="">{templateAudience === "Personalizado" ? "Selecione o aluno" : "Nenhum aluno · apenas salvar"}</option>{students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
          </div>
          <WorkoutComposition exercises={exercises} selectedExercises={selectedExercises} exerciseDetails={exerciseDetails} canSave={Boolean(workoutName.trim() && selectedExercises.length)} canPublish={Boolean(workoutName.trim() && studentId && selectedExercises.length)} saving={saving} onSave={() => void saveTemplate()} onPreview={() => { if (!selectedExercises.length) { onFeedback("Adicione ao menos um exercício para abrir a prévia."); return; } setWorkoutPreview({ title: workoutName.trim() || "Treino em montagem", selectedExercises: [...selectedExercises], exerciseDetails: { ...exerciseDetails } }); }} onParameterChange={updateExerciseParameter} onRemove={toggleExercise} />
          <ExercisePicker exercises={exercises} selectedExercises={selectedExercises} exerciseDetails={exerciseDetails} onToggle={toggleExercise} onParameterChange={updateExerciseParameter} onEdit={editExercise} onRemove={(exercise) => void removeExercise(exercise)} onPreview={(exercise) => setExercisePreview({ exercise, detail: exerciseDetails[exercise.id] })} accessRole={access.role} />
          <div className="training-actions training-actions-final"><button className="detail-secondary" type="button" onClick={saveTemplate} disabled={saving}>{editingTemplateId ? "Atualizar programa-base" : "Salvar programa-base"}</button><button className="detail-save" type="submit" disabled={saving}>{saving ? "Publicando..." : "Enviar para aluno"}</button></div>
        </form>
        </div>
      </details>
       <details className="workspace-panel training-form-panel exercise-library-panel training-collapsible-card">
         <summary className="training-card-summary"><span><small>2 · NOVO EXERCÍCIO</small><strong>Montar exercício do zero</strong><em>Cadastre um movimento, escolha a máquina, a fase e o GIF correspondente.</em></span><ChevronDown /></summary>
          <div className="training-card-content"><header className="training-inline-tools"><p className="panel-helper">Ao salvar, o exercício entra automaticamente no grupo correto da biblioteca.</p></header><div className="starter-library-box"><p>A biblioteca já reúne musculação, peso corporal, alongamento, mobilidade e cardio. Use o formulário para acrescentar novos movimentos.</p><button className="detail-secondary" type="button" onClick={seedStarterExercises}>Carregar biblioteca inicial</button></div><form className="student-detail-form" onSubmit={createExercise}><label>Nome do exercício<input value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="Ex.: Agachamento livre" required /></label><label>Grupo muscular / classe<input value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)} placeholder="Ex.: Peito" required /></label><label>Máquina ou equipamento<select value={exerciseEquipment} onChange={(event) => setExerciseEquipment(event.target.value)}><option value="">Sem máquina · peso livre/corporal</option>{stockMachines.map((machine) => <option key={machine.id} value={machine.name}>{machine.name}{machine.machineCode ? ` · ${machine.machineCode}` : ""}</option>)}</select><small>As máquinas vêm do Estoque; o código QR permanece vinculado ao equipamento.</small></label><label>Região corporal<select value={bodyRegion} onChange={(event) => setBodyRegion(event.target.value as BodyRegion)}><option>Membros superiores</option><option>Tronco anterior</option><option>Tronco posterior</option><option>Região central</option><option>Membros inferiores</option></select></label><label>Fase do treino<select value={phase} onChange={(event) => setPhase(event.target.value as ExercisePhase)}><option>Preparação</option><option>Treino principal</option><option>Cardio</option><option>Finalização</option></select></label><label>Tipo de exercício<select value={exerciseType} onChange={(event) => setExerciseType(event.target.value as ExerciseType)}><option>Força</option><option>Peso corporal</option><option>Alongamento</option><option>Cardio</option></select></label><label>Músculos auxiliares<input value={secondaryMuscles} onChange={(event) => setSecondaryMuscles(event.target.value)} placeholder="Ex.: Tríceps, ombros" /></label><label>Região no corpo anatômico<input value={anatomyRegion} onChange={(event) => setAnatomyRegion(event.target.value)} placeholder="Ex.: Peitoral" /></label><label>Como executar<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Explicação objetiva da execução" /></label><label>Vídeo próprio<input type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="Link após gravar" /></label><label>Biblioteca do GIF<select value={gifProfile} onChange={(event) => { setGifProfile(event.target.value === "feminino" ? "feminino" : "masculino"); setGifFile(null); setSelectedCatalogGif(null); }}><option value="masculino">Masculino</option><option value="feminino">Feminino</option></select><small>O perfil será ajustado automaticamente quando você escolher um GIF na galeria.</small></label><label>Importar GIF {gifProfile}<input type="file" accept="image/gif" onChange={(event) => { setGifFile(event.target.files?.[0] ?? null); setSelectedCatalogGif(null); }} /></label><button type="button" className="detail-secondary gif-catalog-inline" onClick={() => setGifCatalogOpen(true)}>Abrir galeria completa de GIFs</button>{(gifFile || selectedCatalogGif) && <small className="panel-helper">{uploadingGif ? "Enviando GIF…" : selectedCatalogGif ? `GIF global selecionado para ${gifProfile}.` : `Selecionado para ${gifProfile}: ${gifFile?.name}`}</small>}<div className="exercise-form-actions"><button className="detail-save" type="submit" disabled={uploadingGif}>{editingExerciseId ? "Salvar alterações" : "Cadastrar exercício"}</button>{editingExerciseId && <button className="detail-secondary" type="button" onClick={clearExerciseForm}>Cancelar edição</button>}</div></form><details className="training-subcard"><summary className="training-subcard-summary"><span><small>3.1 · BIBLIOTECA</small><strong>Exercícios já cadastrados</strong><em>Escolha um movimento pronto para adicionar ao programa.</em></span><ChevronDown /></summary><ExerciseLibrary exercises={exercises} accessRole={access.role} onEdit={editExercise} onLinkGif={linkExerciseGif} onRemove={(exercise) => void removeExercise(exercise)} onPreview={(exercise) => setExercisePreview({ exercise, detail: exerciseDetails[exercise.id] })} /></details></div>
       </details>
    </section>
     <PublishedWorkouts templates={templates} workouts={workouts} onEditTemplate={beginTemplateEdit} onRemoveTemplate={(template) => void removeTemplate(template)} onEditWorkout={beginWorkoutEdit} onRemoveWorkout={(workout) => void removeWorkout(workout)} onPreviewTemplate={previewTemplate} onPreviewWorkout={previewWorkout} onPrintTemplate={printWorkoutTemplate} onSeedGeneralPrograms={() => void seedGeneralPrograms()} />
    {editingExerciseId && <button className="gif-catalog-launcher" type="button" onClick={() => setGifCatalogOpen(true)}>Escolher GIF do catálogo</button>}
    <GifCatalogPicker open={gifCatalogOpen} initialQuery={gifCatalogQuery(exerciseName, muscleGroup)} initialEquipment={gifCatalogFilters(exerciseName, muscleGroup).equipment} initialMuscle={gifCatalogFilters(exerciseName, muscleGroup).muscle} usedGifPaths={usedGifPaths} onClose={() => setGifCatalogOpen(false)} onSelect={chooseGifFromCatalog} />
    {exercisePreview && <ExercisePreviewModal exercise={exercisePreview.exercise} detail={exercisePreview.detail} onClose={() => setExercisePreview(null)} />}
    {workoutPreview && <WorkoutExecutionPreviewModal exercises={exercises} selectedExercises={workoutPreview.selectedExercises} exerciseDetails={workoutPreview.exerciseDetails} title={workoutPreview.title} onClose={() => setWorkoutPreview(null)} />}
    <button className="training-scroll-top" type="button" onClick={() => scrollToContent(".workspace-intro")}><ArrowUp size={15} /> Voltar ao topo</button>
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
      <section className="workspace-panel charges-panel"><header><div><span>ACOMPANHAMENTO</span><h3>{charges.length} {charges.length === 1 ? "mensalidade" : "mensalidades"}</h3></div><div className="charge-filters" role="tablist" aria-label="Filtrar mensalidades">{([["all", "Todas"], ["dueSoon", "Próximas"], ["overdue", "Vencidas"], ["paid", "Pagas"]] as const).map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></header><div className="charges-list">{visibleCharges.length === 0 ? <div className="directory-empty"><WalletCards /><p>{charges.length === 0 ? "Nenhuma mensalidade gerada ainda." : "Nenhuma mensalidade neste filtro."}</p></div> : visibleCharges.map((charge) => <div className="charge-row" key={charge.id}><div className="charge-main"><strong>{charge.studentName}</strong><small>{charge.planName} · Vencimento {formatDate(charge.dueDate)}{charge.paymentMethod ? ` · ${paymentMethodLabel(charge.paymentMethod)}` : ""}</small></div><b>R$ {charge.amount.toFixed(2).replace(".", ",")}</b><span className={`charge-status ${charge.viewStatus}`}>{chargeStatusLabel(charge.viewStatus)}</span><button className="charge-action" onClick={() => charge.status === "paid" ? toggleCharge(charge) : setPaymentCharge(charge)}>{charge.status === "paid" ? "Desfazer baixa" : "Dar baixa"}</button></div>)}</div></section>
      {paymentCharge && <div className="permissions-backdrop" role="dialog" aria-modal="true" aria-labelledby="payment-title"><section className="payment-modal"><header><div><span>BAIXA MANUAL</span><h2 id="payment-title">Registrar pagamento</h2><p>{paymentCharge.studentName} · R$ {paymentCharge.amount.toFixed(2).replace(".", ",")}</p></div><button aria-label="Fechar registro de pagamento" onClick={() => setPaymentCharge(null)}><X /></button></header><div className="payment-method-grid">{([['pix', 'Pix'], ['cartao_credito', 'Cartão de crédito'], ['cartao_debito', 'Cartão de débito'], ['dinheiro', 'Dinheiro'], ['transferencia', 'Transferência'], ['boleto', 'Boleto']] as const).map(([value, label]) => <button key={value} className={paymentMethod === value ? "active" : ""} onClick={() => setPaymentMethod(value)}>{label}</button>)}</div><div className="payment-modal-actions"><button className="modal-secondary" onClick={() => setPaymentCharge(null)}>Cancelar</button><button className="detail-save" onClick={confirmPayment} disabled={savingPayment}>{savingPayment ? "Salvando..." : "Confirmar pagamento"}</button></div></section></div>}
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
  const [editPhone, setEditPhone] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editCref, setEditCref] = useState("");
  const [editSpecialty, setEditSpecialty] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) {
      setTeachers(readLocalCollection<RegisteredTeacher>(access.academyId, "teachers"));
      return;
    }
    return onSnapshot(collection(db, "academies", access.academyId, "teachers"), (snapshot) => {
      setTeachers(snapshot.docs.map((teacher) => {
        const data = teacher.data() as Omit<RegisteredTeacher, "id">;
        return { id: teacher.id, name: data.name ?? "Professor sem nome", email: data.email ?? null, phone: data.phone ?? null, cpf: data.cpf ?? null, birthDate: data.birthDate ?? null, cref: data.cref ?? null, specialty: data.specialty ?? null, active: data.active !== false };
      }));
    }, (error) => console.error("Não foi possível carregar os professores.", error));
  }, [access.academyId]);

  const filteredTeachers = teachers.filter((teacher) => `${teacher.name} ${teacher.email ?? ""}`.toLowerCase().includes(search.toLowerCase().trim()));
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedTeacher) return;
    setEditName(selectedTeacher.name);
    setEditEmail(selectedTeacher.email ?? "");
    setEditPhone(selectedTeacher.phone ?? ""); setEditCpf(selectedTeacher.cpf ?? ""); setEditBirthDate(selectedTeacher.birthDate ?? ""); setEditCref(selectedTeacher.cref ?? ""); setEditSpecialty(selectedTeacher.specialty ?? "");
  }, [selectedTeacher]);

  async function saveTeacher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTeacher || !editName.trim()) {
      onFeedback("Informe o nome completo do professor.");
      return;
    }
    if (!db) {
      const nextTeachers = teachers.map((teacher) => teacher.id === selectedTeacher.id ? { ...teacher, name: capitalizeName(editName.trim()), email: editEmail.trim() || null, phone: editPhone || null, cpf: editCpf || null, birthDate: editBirthDate || null, cref: editCref.trim() || null, specialty: capitalizeName(editSpecialty.trim()) || null } : teacher);
      setTeachers(nextTeachers);
      writeLocalCollection(access.academyId, "teachers", nextTeachers);
      onFeedback("Dados do professor atualizados no modo local.");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "academies", access.academyId, "teachers", selectedTeacher.id), { name: capitalizeName(editName.trim()), email: editEmail.trim() || null, phone: editPhone || null, cpf: editCpf || null, birthDate: editBirthDate || null, cref: editCref.trim() || null, specialty: capitalizeName(editSpecialty.trim()) || null });
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
              <button className={selectedId === teacher.id ? "directory-row selected" : "directory-row"} key={teacher.id} onClick={() => { setSelectedId(teacher.id); scrollToContent(".student-detail-panel"); }}>
                <i>{teacher.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</i><span><strong>{teacher.name}</strong><small>{teacher.email || "E-mail ainda não informado"}</small></span><em className={teacher.active === false ? "inactive" : ""}>{teacher.active === false ? "Suspenso" : "Ativo"}</em><ChevronRight />
              </button>
            ))}
          </div>
        </article>
        <aside className="workspace-panel student-detail-panel">
          {selectedTeacher ? <>
            <header><div><span>PERFIL DO PROFESSOR</span><h3>{selectedTeacher.name}</h3><p className="student-profile-subtitle">{selectedTeacher.specialty || "Especialidade não informada"}</p></div><span className={selectedTeacher.active === false ? "detail-status inactive" : "detail-status"}>{selectedTeacher.active === false ? "Suspenso" : "Ativo"}</span></header>
            <form className="student-detail-form" onSubmit={saveTeacher}>
              <label>Nome completo<input value={editName} onChange={(event) => setEditName(capitalizeName(event.target.value))} required /></label>
              <label>E-mail Google<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></label>
              <label>Telefone<input value={editPhone} onChange={(event) => setEditPhone(maskPhone(event.target.value))} inputMode="tel" placeholder="(00) 00000-0000" /></label>
              <label>CPF<input value={editCpf} onChange={(event) => setEditCpf(maskCpf(event.target.value))} inputMode="numeric" placeholder="000.000.000-00" /></label>
              <label>Data de nascimento<input type="date" value={editBirthDate} onChange={(event) => setEditBirthDate(event.target.value)} max={todayIso()} /></label>
              <label>CREF<input value={editCref} onChange={(event) => setEditCref(event.target.value.toUpperCase())} placeholder="Ex.: 012345-G/SP" /></label>
              <label>Especialidade<input value={editSpecialty} onChange={(event) => setEditSpecialty(capitalizeName(event.target.value))} placeholder="Ex.: Musculação e treinamento funcional" /></label>
              <button className="detail-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
            </form>
            <button className="detail-toggle" onClick={toggleTeacher}>{selectedTeacher.active === false ? "Reativar acesso" : "Suspender acesso"}</button>
          </> : <div className="directory-empty detail-empty"><UserRoundCheck /><h3>Selecione um professor</h3><p>Escolha um cadastro para visualizar e editar os dados.</p></div>}
        </aside>
      </section>
    </div>
  );
}

function StudentMessagesPanel({ messages, body, sending, onBodyChange, onSend }: { messages: InternalMessage[]; body: string; sending: boolean; onBodyChange: (value: string) => void; onSend: () => void }) {
  return <section className="student-profile-messages"><div className="student-profile-message-heading"><span><MessageCircle /> MENSAGEM INTERNA</span><small>{messages.length} enviada(s)</small></div>{messages.length > 0 && <div className="student-message-history">{messages.slice(0, 2).map((message) => <div key={message.id}><strong>{message.senderName}</strong><p>{message.body}</p></div>)}</div>}<div className="student-message-compose"><textarea value={body} onChange={(event) => onBodyChange(event.target.value)} placeholder="Escreva uma orientação ou lembrete para o aluno..." /><button type="button" onClick={onSend} disabled={sending || !body.trim()}>{sending ? "Enviando..." : "Enviar mensagem"}</button></div></section>;
}

function StudentsModule({ onNewStudent, onFeedback, onNavigate, initialSearch = "", initialStudentId = "" }: { onNewStudent?: () => void; onFeedback: (message: string) => void; onNavigate: (module: string, studentId: string) => void; initialSearch?: string; initialStudentId?: string }) {
  const access = useAccess();
  const [students, setStudents] = useState<RegisteredStudent[]>([]);
  const [teachers, setTeachers] = useState<RegisteredTeacher[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialStudentId || null);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
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
  useEffect(() => { if (initialStudentId) { setSelectedId(initialStudentId); scrollToContent(".student-detail-panel"); } }, [initialStudentId]);

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
        const data = student.data() as { name?: string; email?: string | null; phone?: string | null; cpf?: string | null; birthDate?: string | null; plan?: string; teacherId?: string | null; anatomyProfile?: "masculino" | "feminino"; active?: boolean };
        return { id: student.id, name: data.name ?? "Aluno sem nome", email: data.email ?? null, phone: data.phone ?? null, cpf: data.cpf ?? null, birthDate: data.birthDate ?? null, plan: data.plan ?? "Sem plano", teacherId: data.teacherId ?? null, anatomyProfile: data.anatomyProfile === "feminino" ? "feminino" : "masculino", active: data.active !== false };
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
    setEditBirthDate(selectedStudent.birthDate ?? "");
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
      setStudentExecutions(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<WorkoutExecution, "id">) })).sort((a, b) => workoutExecutionTime(b.completedAt) - workoutExecutionTime(a.completedAt)));
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
      const nextStudents = students.map((student) => student.id === selectedStudent.id ? { ...student, name: capitalizeName(editName.trim()), email: editEmail.trim() || null, phone: editPhone.trim() || null, cpf: editCpf.trim() || null, birthDate: editBirthDate || null, plan: editPlan, teacherId: editTeacherId || null, anatomyProfile: editAnatomyProfile } : student);
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
        birthDate: editBirthDate || null,
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
              <button className={selectedId === student.id ? "directory-row selected" : "directory-row"} key={student.id} onClick={() => { setSelectedId(student.id); scrollToContent(".student-detail-panel"); }}>
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
            <div className="student-profile-actions"><button type="button" onClick={() => onNavigate("Treinos", selectedStudent.id)}>Gerenciar treino</button><button type="button" onClick={() => onNavigate("Avaliações", selectedStudent.id)}>Nova avaliação</button>{access.role === "admin" && <button type="button" onClick={() => onNavigate("Financeiro", selectedStudent.id)}>Ver financeiro</button>}</div>
            <StudentMessagesPanel messages={studentMessages} body={messageBody} sending={sendingMessage} onBodyChange={setMessageBody} onSend={sendInternalMessage} />
            <div className="student-profile-divider"><span>CADASTRO E ACESSO</span></div>
              {access.role === "admin" ? <form className="student-detail-form" onSubmit={saveStudent}>
            <label>Nome completo<input value={editName} onChange={(event) => setEditName(capitalizeName(event.target.value))} autoComplete="name" required /></label>
              <label>Login de contato<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} autoComplete="email" placeholder="E-mail opcional" /></label>
              <label>Telefone<input value={editPhone} onChange={(event) => setEditPhone(maskPhone(event.target.value))} inputMode="tel" placeholder="(00) 00000-0000" /></label>
              <label>CPF<input value={editCpf} onChange={(event) => setEditCpf(maskCpf(event.target.value))} inputMode="numeric" placeholder="000.000.000-00" /></label>
              <label>Data de nascimento<input type="date" value={editBirthDate} onChange={(event) => setEditBirthDate(event.target.value)} max={todayIso()} /><small>{calculateAge(editBirthDate) !== null ? `${calculateAge(editBirthDate)} anos` : "Usada para idade e mensagem de aniversário."}</small></label>
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
  const [photoSaving, setPhotoSaving] = useState(false);
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
        await setDoc(doc(db, "academies", access.academyId), { phone: normalized.phone || null, instagramUrl: normalized.instagramUrl || null, siteUrl: normalized.siteUrl || null, updatedAt: serverTimestamp() }, { merge: true });
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
  async function importPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setPhotoSaving(true);
    try { const photoUrl = await compressProfilePhoto(file); setForm((current) => ({ ...current, photoUrl })); onFeedback("Foto importada. Clique em Salvar perfil para confirmar."); }
    catch { onFeedback("Não foi possível importar essa foto. Use JPG, PNG ou WebP de até 6 MB."); }
    finally { setPhotoSaving(false); }
  }
  return <div className="permissions-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-title">
    <section className="permissions-panel manager-profile-panel">
      <header><div><span>PERFIL E DADOS DA ACADEMIA</span><h2 id="profile-title">Perfil do gestor</h2><p>Atualize seus dados, os contatos e o funcionamento da academia.</p></div><button aria-label="Fechar perfil" onClick={onClose}><X /></button></header>
      <form className="student-detail-form" onSubmit={save}>
        {form.photoUrl && <img className="manager-profile-photo" src={form.photoUrl} alt="Foto do gestor" />}
        <label>Foto do perfil<input type="file" accept="image/jpeg,image/png,image/webp" onChange={importPhoto} disabled={photoSaving} /><small>{photoSaving ? "Importando..." : "Importe uma imagem do dispositivo."}</small></label>
        {(["name", "phone", "cnpj", "cpf", "instagramUrl", "siteUrl"] as const).map((key) => <label key={key}>{({ name: "Nome completo", phone: "Telefone", cnpj: "CNPJ", cpf: "CPF", instagramUrl: "Link do Instagram", siteUrl: "Link do site" } as Record<string, string>)[key]}<input value={form[key] ?? ""} onChange={(event) => update(key, event.target.value)} inputMode={key === "phone" || key === "cpf" || key === "cnpj" ? "numeric" : undefined} /></label>)}
        <div className="form-actions"><button className="detail-save" type="submit" disabled={saving || photoSaving}>{saving ? "Salvando..." : "Salvar perfil"}</button><button className="secondary-action" type="button" onClick={() => void logout()}>Sair da conta</button></div>
      </form>
      <div className="manager-profile-hours">
        <AcademyHoursSettings onFeedback={onFeedback} />
      </div>
    </section>
  </div>;
}

function AppearancePanel({ theme, onThemeChange, onClose }: { theme: Theme; onThemeChange: (theme: Theme) => void; onClose: () => void }) {
  return <div className="permissions-backdrop" role="dialog" aria-modal="true" aria-labelledby="appearance-title"><section className="permissions-panel appearance-only-panel"><header><div><span>CONFIGURAÇÕES DO PROFESSOR</span><h2 id="appearance-title">Configurações</h2><p>Organize a aparência do ambiente e mantenha a leitura confortável durante o atendimento.</p></div><button aria-label="Fechar configurações" onClick={onClose}><X /></button></header><section className="settings-section settings-card appearance-section"><div className="settings-section-heading"><div><span>IDENTIDADE VISUAL</span><h3>Tema do ambiente</h3></div><small>Preferência deste ambiente</small></div><ThemeSwitcher theme={theme} onChange={onThemeChange} /></section></section></div>;
}

const academyWeekdays = [
  ["monday", "Segunda"], ["tuesday", "Terça"], ["wednesday", "Quarta"], ["thursday", "Quinta"],
  ["friday", "Sexta"], ["saturday", "Sábado"], ["sunday", "Domingo"],
] as const;

function AcademyHoursSettings({ onFeedback }: { onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [days, setDays] = useState<string[]>(academyWeekdays.map(([value]) => value));
  const [openingTime, setOpeningTime] = useState("06:00");
  const [closingTime, setClosingTime] = useState("22:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) {
      try {
        const saved = JSON.parse(window.localStorage.getItem(`orquestra-fit:${access.academyId}:academy-settings`) ?? "null") as { openingDays?: string[]; openingTime?: string; closingTime?: string } | null;
        if (saved) { setDays(saved.openingDays?.length ? saved.openingDays : academyWeekdays.map(([value]) => value)); setOpeningTime(saved.openingTime || "06:00"); setClosingTime(saved.closingTime || "22:00"); }
      } catch { /* usa o padrão */ }
      return;
    }
    return onSnapshot(doc(db, "academies", access.academyId), (snapshot) => {
      const data = snapshot.data() as { openingDays?: unknown; openingTime?: string; closingTime?: string } | undefined;
      const savedDays = Array.isArray(data?.openingDays) ? data.openingDays.filter((item): item is string => typeof item === "string") : [];
      setDays(savedDays.length ? savedDays : academyWeekdays.map(([value]) => value));
      setOpeningTime(data?.openingTime || "06:00");
      setClosingTime(data?.closingTime || "22:00");
    }, () => onFeedback("Não foi possível carregar o funcionamento da academia."));
  }, [access.academyId, onFeedback]);

  function toggleDay(day: string) {
    setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  }

  async function save() {
    if (!days.length) { onFeedback("Selecione ao menos um dia de funcionamento."); return; }
    setSaving(true);
    const settings = { openingDays: academyWeekdays.map(([value]) => value).filter((value) => days.includes(value)), openingTime, closingTime };
    try {
      if (!db) {
        window.localStorage.setItem(`orquestra-fit:${access.academyId}:academy-settings`, JSON.stringify(settings));
        window.dispatchEvent(new Event("orquestra-fit:collection-updated"));
      } else await setDoc(doc(db, "academies", access.academyId), { ...settings, updatedAt: serverTimestamp(), updatedBy: access.userId }, { merge: true });
      onFeedback("Funcionamento da academia atualizado.");
    } catch { onFeedback("Não foi possível salvar o funcionamento agora."); }
    finally { setSaving(false); }
  }

  return <section className="settings-section settings-card academy-hours-section">
    <div className="settings-section-heading"><div><span>FUNCIONAMENTO</span><h3>Dias e horários da academia</h3></div><small>{days.length === 7 ? "Todos os dias" : `${days.length} dia(s) selecionado(s)`}</small></div>
    <p className="academy-hours-helper">Marque os dias em que a academia recebe alunos. Sábado e domingo já ficam disponíveis no padrão.</p>
    <div className="academy-hours-days">{academyWeekdays.map(([value, label]) => <button type="button" key={value} className={days.includes(value) ? "active" : ""} aria-pressed={days.includes(value)} onClick={() => toggleDay(value)}>{label}</button>)}</div>
    <div className="academy-hours-times"><label>Abertura<input type="time" value={openingTime} onChange={(event) => setOpeningTime(event.target.value)} /></label><label>Fechamento<input type="time" value={closingTime} onChange={(event) => setClosingTime(event.target.value)} /></label></div>
    <button className="detail-save" type="button" onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar funcionamento"}</button>
  </section>;
}

function PermissionsPanel({ theme, onThemeChange, onClose, onFeedback }: { theme: Theme; onThemeChange: (theme: Theme) => void; onClose: () => void; onFeedback: (message: string) => void }) {
  const access = useAccess();
  const [roleToAdd, setRoleToAdd] = useState<"admin" | "teacher" | "student" | null>(null);
  const [inviteEmail, setInviteEmail] = useState("damadeferroct2026@gmail.com");
  const [academyName, setAcademyName] = useState("Dama de Ferro Academia");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [developerConsoleOpen, setDeveloperConsoleOpen] = useState(false);
  const roles = [
    ...(access.accountType === "developer" ? [{ id: "admin", label: "Dono / administrador", tone: "admin", description: "Crie um ambiente isolado e libere a gestão para o dono da academia.", access: "Nova academia" }] : []),
    { id: "teacher", label: "Professor", tone: "teacher", description: "Acompanha alunos vinculados e monta ou publica treinos.", access: "Professor + alunos" },
    { id: "student", label: "Aluno", tone: "student", description: "Acessa apenas seus treinos, evolução, agenda e perfil.", access: "Área do aluno" },
  ];
  function chooseInviteRole(role: "admin" | "teacher" | "student") {
    setRoleToAdd(role);
    setGeneratedCode(null);
    if (role !== "admin") setInviteEmail("");
    else setInviteEmail((current) => current || "damadeferroct2026@gmail.com");
  }

  async function generateAccessCode() {
    if (!roleToAdd) return;
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (roleToAdd === "admin" && access.accountType !== "developer") {
      onFeedback("Somente a Central de Desenvolvimento pode liberar uma nova academia.");
      return;
    }
    if (roleToAdd === "admin" && (!academyName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) {
      onFeedback("Informe o Gmail da proprietária para criar o convite de gestão.");
      return;
    }
    setGenerating(true);
    const random = Array.from(crypto.getRandomValues(new Uint32Array(2))).map((value) => value.toString(36).toUpperCase()).join("").slice(0, 8);
    const code = `DF-${random}`;
    try {
      if (db) {
        let academyId = access.academyId;
        if (roleToAdd === "admin") {
          const academyRef = doc(collection(db, "academies"));
          const memberRef = doc(db, "academies", academyRef.id, "members", access.userId);
          const provisioningBatch = writeBatch(db);
          provisioningBatch.set(academyRef, {
            name: academyName.trim(), ownerId: access.userId, ownerEmail: normalizedEmail,
            accountType: "academy_admin", environment: "production", demoData: false,
            plan: "basic", status: "active", provisionedBy: access.userId, createdAt: serverTimestamp(),
          });
          provisioningBatch.set(memberRef, {
            userId: access.userId, displayName: access.user.displayName ?? "Orquestra.cs",
            email: access.user.email ?? null, role: "admin", active: true, createdAt: serverTimestamp(),
          });
          await provisioningBatch.commit();
          academyId = academyRef.id;
        }
        await setDoc(doc(db, "accessCodes", code), {
          academyId,
          role: roleToAdd,
          invitedEmail: normalizedEmail || null,
          ...(roleToAdd === "admin" ? { academyName: academyName.trim() } : {}),
          active: true, createdBy: access.userId, createdAt: serverTimestamp(),
        });
        await addDoc(collection(db, "auditLogs"), {
          academyId,
          userId: access.userId,
          userName: access.user.displayName ?? access.user.email ?? "Desenvolvedor",
          userEmail: access.user.email ?? null,
          role: "developer",
          action: roleToAdd === "admin" ? "academy_provisioned" : "invite_created",
          label: roleToAdd === "admin" ? "Nova academia provisionada" : `Convite de ${roleToAdd === "teacher" ? "professor" : "aluno"} criado`,
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
        <header><div><span>{access.accountType === "developer" ? "CENTRAL DE DESENVOLVIMENTO" : "CONFIGURAÇÕES DA ACADEMIA"}</span><h2 id="permissions-title">Configurações</h2><p>{access.accountType === "developer" ? "Libere ambientes isolados para donos de academia e acompanhe a plataforma." : "Equipe, funcionamento, aparência e comunicados da academia."}</p></div><button aria-label="Fechar configurações" onClick={onClose}><X /></button></header>
         <section className="settings-section settings-card settings-access-section">
          <div className="settings-section-heading"><div><span>CONTROLE DE ACESSO</span><h3>Equipe e permissões</h3></div><small>Quem pode acessar cada área</small></div>
          <div className="permission-roles">
          {roles.map((role) => <article className={`permission-role ${role.tone}`} key={role.label}><div className="permission-role-icon"><ShieldCheck /></div><div><strong>{role.label}</strong><p>{role.description}</p><span>Acesso: {role.access}</span></div><button onClick={() => chooseInviteRole(role.id as "admin" | "teacher" | "student")}><Plus size={16} /> Adicionar</button></article>)}
          </div>
          {roleToAdd && <div className="invite-box"><div><span>NOVO CÓDIGO</span><strong>{roleToAdd === "admin" ? "Liberar nova academia" : `Convite de ${roleToAdd === "teacher" ? "professor" : "aluno"}`}</strong><p>{roleToAdd === "admin" ? "Crie um ambiente isolado para a academia e entregue a gestão à proprietária." : "O convite fica vinculado ao Gmail informado. A pessoa deverá entrar com essa conta Google para ativá-lo."}</p></div>{roleToAdd === "admin" && <label className="invite-email-field">Nome da academia<input value={academyName} onChange={(event) => setAcademyName(event.target.value)} required /></label>}<label className="invite-email-field">Gmail autorizado<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="nome@gmail.com" required={roleToAdd === "admin"} /></label><button onClick={generateAccessCode} disabled={generating}>{generating ? "Gerando..." : roleToAdd === "admin" ? "Criar academia e código" : "Gerar código"}</button>{generatedCode && <div className="generated-code"><code>{generatedCode}</code><button onClick={() => navigator.clipboard?.writeText(generatedCode).then(() => onFeedback("Código copiado."))}>Copiar</button></div>}</div>}
        </section>
         {access.accountType === "developer" && <section className="settings-section settings-card developer-console-launch">
          <div className="settings-section-heading"><div><span>OPERAÇÃO SAAS</span><h3>Auditoria e academias</h3></div><small>Central exclusiva do desenvolvedor</small></div>
          <p>Abra a central em uma tela própria para acompanhar academias reais, mensalidades, acessos e auditoria sem apertar as configurações.</p>
          <button className="detail-save" type="button" onClick={() => setDeveloperConsoleOpen(true)}>Abrir Central do Desenvolvedor</button>
        </section>}
         {access.accountType === "developer" && <section className="settings-section settings-card media-settings-section">
          <div className="settings-section-heading"><div><span>MÍDIAS</span><h3>GIFs e vídeos da plataforma</h3></div><small>Biblioteca global</small></div>
          <p className="media-settings-helper">Centralize a importação da biblioteca global de GIFs. Os vídeos próprios continuam vinculados ao cadastro de cada exercício e poderão ser organizados nesta mesma área.</p>
          <GifLibraryImporter onFeedback={onFeedback} />
        </section>}
        {access.accountType !== "developer" && <AcademyHoursSettings onFeedback={onFeedback} />}
         <section className="settings-section settings-card appearance-section">
          <div className="settings-section-heading"><div><span>IDENTIDADE VISUAL</span><h3>Aparência</h3></div><small>Preferência deste ambiente</small></div>
          <ThemeSwitcher theme={theme} onChange={onThemeChange} />
        </section>
         <section className="settings-section settings-card settings-announcement-section">
          <ManagerAnnouncementComposer />
        </section>
        <div className="permissions-note"><ShieldCheck size={18} /><span>O acesso é protegido pelo Firebase. Usuários sem vínculo ativo com esta academia não conseguem abrir os dados.</span></div>
      </section>
      {access.accountType === "developer" && developerConsoleOpen && <DeveloperConsolePanel fullScreen onClose={() => setDeveloperConsoleOpen(false)} onFeedback={onFeedback} />}
    </div>
  );
}

type DeveloperAcademy = {
  id: string;
  name: string;
  ownerEmail?: string | null;
  plan?: string | null;
  status?: string | null;
  billingStatus?: string | null;
  billingDueDate?: string | null;
  monthlyAmount?: number | null;
  createdAt?: unknown;
};

type DeveloperMember = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean;
  lastAccessAt?: unknown;
  lastSeenAt?: unknown;
};

type DeveloperAudit = {
  id: string;
  userName?: string | null;
  userEmail?: string | null;
  role?: string | null;
  action?: string | null;
  label?: string | null;
  createdAt?: unknown;
};

function firestoreDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function dateTimeLabel(value: unknown) {
  const date = firestoreDate(value);
  return date ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Ainda não registrado";
}

function academyStatusLabel(status?: string | null) {
  return status === "past_due" ? "Em atraso" : status === "suspended" ? "Suspensa" : "Ativa";
}

function memberRoleLabel(role?: string | null) {
  return role === "admin" ? "Gestor" : role === "teacher" ? "Professor" : "Aluno";
}

function DeveloperConsolePanel({ onFeedback, fullScreen = false, onClose }: { onFeedback: (message: string) => void; fullScreen?: boolean; onClose?: () => void }) {
  const access = useAccess();
  const [academies, setAcademies] = useState<DeveloperAcademy[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState("");
  const [members, setMembers] = useState<DeveloperMember[]>([]);
  const [audit, setAudit] = useState<DeveloperAudit[]>([]);
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<"active" | "past_due" | "suspended">("active");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const firestore = db;
    if (!firestore || access.accountType !== "developer") return;
    return onSnapshot(collection(firestore, "academies"), (snapshot) => {
      const next = snapshot.docs.filter((item) => {
        const data = item.data();
        const name = String(data.name ?? "");
        return data.accountType !== "developer" && data.environment !== "test" && data.demoData !== true && !/ambiente de testes|orquestra\.cs/i.test(name);
      }).map((item) => {
        const data = item.data();
        return { id: item.id, name: data.name ?? "Academia sem nome", ownerEmail: data.ownerEmail ?? null, plan: data.plan ?? "basic", status: data.status ?? "active", billingStatus: data.billingStatus ?? data.status ?? "active", billingDueDate: data.billingDueDate ?? null, monthlyAmount: Number(data.monthlyAmount ?? 0), createdAt: data.createdAt };
      }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setAcademies(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? "");
    }, () => onFeedback("Não foi possível carregar as academias da Central."));
  }, [access.accountType, onFeedback]);

  useEffect(() => {
    const firestore = db;
    if (!firestore || access.accountType !== "developer" || !academies.length) return;
    const unsubscribers = academies.map((academy) => onSnapshot(collection(firestore, "academies", academy.id, "members"), (snapshot) => {
      setMemberCounts((current) => ({ ...current, [academy.id]: snapshot.size }));
    }, () => undefined));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [access.accountType, academies]);

  useEffect(() => {
    const firestore = db;
    if (!firestore || access.accountType !== "developer" || !selectedId) return;
    const selected = academies.find((academy) => academy.id === selectedId);
    setPlan(selected?.plan ?? "basic");
    setDueDate(selected?.billingDueDate ?? "");
    setStatus(selected?.billingStatus === "past_due" || selected?.billingStatus === "suspended" ? selected.billingStatus : "active");
    setAmount(selected?.monthlyAmount ? String(selected.monthlyAmount).replace(".", ",") : "");
    setEditing(false);
    const unsubscribeMembers = onSnapshot(collection(firestore, "academies", selectedId, "members"), (snapshot) => {
      setMembers(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<DeveloperMember, "id">) })).sort((a, b) => (a.displayName ?? a.email ?? "").localeCompare(b.displayName ?? b.email ?? "", "pt-BR")));
    }, () => onFeedback("Não foi possível carregar os acessos desta academia."));
    const auditQuery = query(collection(firestore, "auditLogs"), where("academyId", "==", selectedId));
    const unsubscribeAudit = onSnapshot(auditQuery, (snapshot) => {
      setAudit(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<DeveloperAudit, "id">) })).sort((a, b) => (firestoreDate(b.createdAt)?.getTime() ?? 0) - (firestoreDate(a.createdAt)?.getTime() ?? 0)).slice(0, 40));
    }, () => onFeedback("Não foi possível carregar a auditoria desta academia."));
    return () => { unsubscribeMembers(); unsubscribeAudit(); };
  }, [access.accountType, academies, onFeedback, selectedId]);

  async function saveAcademy() {
    const firestore = db;
    if (!firestore || !selectedId) return;
    setSaving(true);
    try {
      await updateDoc(doc(firestore, "academies", selectedId), { plan: plan.trim() || "basic", billingDueDate: dueDate || null, billingStatus: status, status: status === "suspended" ? "suspended" : "active", monthlyAmount: parseCurrency(amount), updatedAt: serverTimestamp(), updatedBy: access.userId });
      await addDoc(collection(firestore, "auditLogs"), { academyId: selectedId, userId: access.userId, userName: access.user.displayName ?? access.user.email ?? "Desenvolvedor", userEmail: access.user.email ?? null, role: "developer", action: "academy_billing_update", label: "Controle da academia atualizado", createdAt: serverTimestamp() });
      setEditing(false);
      onFeedback("Controle da academia atualizado.");
    } catch {
      onFeedback("Não foi possível atualizar o controle da academia.");
    } finally {
      setSaving(false);
    }
  }

  if (access.accountType !== "developer") return null;
  const selected = academies.find((academy) => academy.id === selectedId);
  const onlineLimit = Date.now() - 5 * 60 * 1000;
  const onlineMembers = members.filter((member) => { const date = firestoreDate(member.lastSeenAt); return date ? date.getTime() >= onlineLimit : false; });
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const accessesToday = members.filter((member) => { const date = firestoreDate(member.lastAccessAt); return date ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date) === todayKey : false; }).length;
  const panel = <section className="settings-section developer-console-section">
    <div className="settings-section-heading"><div><span>OPERAÇÃO SAAS</span><h3>Auditoria e academias</h3></div><small>Controle central da plataforma</small></div>
    <div className="developer-kpi-grid"><article><small>ACADEMIAS</small><strong>{academies.length}</strong><span>ambientes cadastrados</span></article><article><small>USUÁRIOS ATIVOS</small><strong>{members.filter((member) => member.active !== false).length}</strong><span>na academia selecionada</span></article><article><small>ONLINE AGORA</small><strong>{onlineMembers.length}</strong><span>últimos 5 minutos</span></article><article><small>ACESSOS HOJE</small><strong>{accessesToday}</strong><span>último registro</span></article></div>
    <div className="developer-academy-layout">
      <div className="developer-academy-list"><div className="developer-subheading"><strong>Academias</strong><span>{academies.length} cadastrada(s)</span></div>{academies.length === 0 ? <p className="panel-helper">Nenhuma academia provisionada ainda.</p> : academies.map((academy) => <button type="button" key={academy.id} className={selectedId === academy.id ? "developer-academy-row active" : "developer-academy-row"} onClick={() => setSelectedId(academy.id)}><span><strong>{academy.name}</strong><small>{academy.ownerEmail || "Gmail não informado"}</small></span><em className={academyStatusLabel(academy.billingStatus) === "Ativa" ? "online" : "warning"}>{academyStatusLabel(academy.billingStatus)}</em><b>{memberCounts[academy.id] ?? 0}</b></button>)}</div>
      {selected && <div className="developer-academy-detail"><header><div><span>ACADEMIA SELECIONADA</span><h4>{selected.name}</h4><p>{selected.ownerEmail || "Gmail da proprietária não informado"}</p></div><button type="button" className="detail-secondary" onClick={() => setEditing((current) => !current)}>{editing ? "Cancelar" : "Editar controle"}</button></header>
        <div className="developer-academy-meta"><div><small>ENTRADA</small><strong>{dateTimeLabel(selected.createdAt)}</strong></div><div><small>PLANO</small><strong>{selected.plan || "basic"}</strong></div><div><small>VENCIMENTO</small><strong>{selected.billingDueDate ? formatDate(selected.billingDueDate) : "Não definido"}</strong></div><div><small>STATUS</small><strong>{academyStatusLabel(selected.billingStatus)}</strong></div></div>
        {editing && <div className="developer-billing-form"><label>Plano<input value={plan} onChange={(event) => setPlan(event.target.value)} /></label><label>Mensalidade<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="R$ 0,00" /></label><label>Vencimento<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="active">Ativa</option><option value="past_due">Em atraso</option><option value="suspended">Suspensa</option></select></label><button type="button" className="detail-save" onClick={() => void saveAcademy()} disabled={saving}>{saving ? "Salvando..." : "Salvar controle"}</button></div>}
        <div className="developer-members-heading"><div><span>ACESSO GERAL</span><strong>{members.length} pessoas vinculadas</strong></div><small>{onlineMembers.length} online agora</small></div><div className="developer-member-list">{members.length === 0 ? <p className="panel-helper">Nenhum usuário vinculado ainda.</p> : members.map((member) => { const online = onlineMembers.some((item) => item.id === member.id); return <div className="developer-member-row" key={member.id}><span className={online ? "presence-dot online" : "presence-dot"} /><div><strong>{member.displayName || member.email || "Usuário sem nome"}</strong><small>{member.email || "Sem Gmail"} · {memberRoleLabel(member.role)}</small></div><em>{online ? "Online" : "Offline"}</em><small>{dateTimeLabel(member.lastAccessAt)}</small></div>; })}</div>
        <div className="developer-members-heading"><div><span>AUDITORIA</span><strong>Últimos acessos e eventos</strong></div><small>{audit.length} registros</small></div><div className="developer-audit-list">{audit.length === 0 ? <p className="panel-helper">Nenhum evento registrado ainda.</p> : audit.map((item) => <div className="developer-audit-row" key={item.id}><Activity size={15} /><div><strong>{item.label || item.action || "Evento"}</strong><small>{item.userName || item.userEmail || "Usuário"} · {memberRoleLabel(item.role)}</small></div><time>{dateTimeLabel(item.createdAt)}</time></div>)}</div>
      </div>}
    </div>
  </section>;
  if (fullScreen) return <div className="developer-console-screen" role="dialog" aria-modal="true" aria-label="Central do desenvolvedor">
    <header className="developer-console-screen-header">
      <div><span>CENTRAL DE DESENVOLVIMENTO</span><h2>Auditoria e academias</h2><p>Acompanhe apenas academias comerciais provisionadas pela Orquestra.cs.</p></div>
      <button type="button" aria-label="Fechar Central do Desenvolvedor" onClick={onClose}><X /></button>
    </header>
    {panel}
  </div>;
  return panel;
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
        const data = student.data() as { name?: string; plan?: string; birthDate?: string | null; active?: boolean };
        return { id: student.id, name: data.name ?? "Aluno sem nome", plan: data.plan ?? "Sem plano", birthDate: data.birthDate ?? null, active: data.active };
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
  const today = new Date();
  const birthdayStudents = registeredStudents.filter((student) => { const parts = student.birthDate?.split("-").map(Number); return parts?.[1] === today.getMonth() + 1 && parts?.[2] === today.getDate(); });
  const money = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;
  return (
    <WorkspaceShell profile="Gestão" theme={theme} onThemeChange={onThemeChange} onNewStudent={() => setNewMemberRole("student")}>
      <div className="workspace-content">
        <section className="workspace-intro">
          <div><span>{brazilLongDate()}</span><h2>{brazilGreeting()}, {firstName(registeredProfile?.name || registeredProfile?.displayName || access.user.displayName, access.user.email)}.</h2><p>Uma leitura direta da operação para você decidir o que precisa de atenção hoje.</p></div>
          <button onClick={() => setNewMemberRole("student")}><Plus /> Novo aluno</button>
        </section>
        <div className="dashboard-metrics-heading"><span>INDICADORES</span><button type="button" onClick={() => setMetricsVisible((visible) => !visible)} aria-label={metricsVisible ? "Ocultar indicadores" : "Mostrar indicadores"}>{metricsVisible ? <EyeOff /> : <Eye />}<span>{metricsVisible ? "Ocultar valores" : "Mostrar valores"}</span></button></div>
        <section className={metricsVisible ? "metric-grid" : "metric-grid metrics-hidden"}>
          <MetricCard icon={Users} label="Alunos ativos" value={metricsVisible ? String(registeredStudents.filter((student) => student.active !== false).length) : "••••"} note={metricsVisible ? `${registeredStudents.length} cadastro${registeredStudents.length === 1 ? "" : "s"} total` : "Valor protegido"} />
          <MetricCard icon={CircleDollarSign} label="Receita prevista" value={metricsVisible ? money(dashboardTotal) : "R$ ••••"} note={metricsVisible ? `${dashboardPercent}% já recebido` : "Valor protegido"} />
          <MetricCard icon={Banknote} label="Em aberto" value={metricsVisible ? money(dashboardOpen) : "R$ ••••"} note={metricsVisible ? `${dashboardCharges.filter((charge) => charge.status !== "paid").length} mensalidades` : "Valor protegido"} warning={dashboardOpen > 0} />
          <MetricCard icon={Activity} label="Frequência hoje" value={metricsVisible ? "—" : "••••"} note={metricsVisible ? "Sem registros ainda" : "Valor protegido"} />
        </section>
        {birthdayStudents.length > 0 && <section className="birthday-alert"><Sparkles /><div><small>ANIVERSARIANTE DO DIA</small><strong>{birthdayStudents.map((student) => student.name).join(", ")}</strong><span>{birthdayStudents.length === 1 ? "Hoje é aniversário deste aluno." : "Hoje é aniversário destes alunos."}</span></div><button type="button" onClick={() => navigateWorkspace("Alunos", birthdayStudents[0].id)}>Abrir cadastro <ChevronRight /></button></section>}
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
            <header><div><span>FINANCEIRO</span><h3>Recebimentos do mês</h3></div><button aria-label="Abrir financeiro" onClick={() => navigateWorkspace("Financeiro")}><MoreHorizontal /></button></header>
            <div className="finance-total"><small>PREVISTO</small><strong>{money(dashboardTotal)}</strong><span>{dashboardCharges.length} mensalidades cadastradas</span></div>
            <div className="finance-bar"><i style={{ width: `${dashboardPercent}%` }} /><b style={{ width: `${Math.max(0, 100 - dashboardPercent)}%` }} /></div>
            <div className="finance-legend">
              <div><span><i className="received" />Recebido</span><strong>{money(dashboardReceived)}</strong></div>
              <div><span><i className="pending" />Em aberto</span><strong>{money(dashboardOpen)}</strong></div>
              <div><span><i className="overdue" />Em atraso</span><strong>{money(dashboardOverdue.reduce((total, charge) => total + charge.amount, 0))}</strong></div>
            </div>
            <button className="outline-action" onClick={() => navigateWorkspace("Financeiro")}>Abrir financeiro <ArrowRight /></button>
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
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [address, setAddress] = useState("");
  const [cref, setCref] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [plan, setPlan] = useState("Mensal");
  const [birthDate, setBirthDate] = useState("");
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
          ...(role === "student" ? { phone: phone || null, cpf: cpf || null, address: address.trim() || null, plan, anatomyProfile, birthDate: birthDate || null } : { phone: phone || null, cpf: cpf || null, birthDate: birthDate || null, cref: cref.trim() || null, specialty: capitalizeName(specialty.trim()) || null }),
          active: true,
          createdBy: access.userId,
          createdAt: serverTimestamp(),
        });
      } else {
        const id = `local-${role}-${Date.now()}`;
        if (role === "student") {
          const students = readLocalCollection<RegisteredStudent>(access.academyId, "students");
          writeLocalCollection(access.academyId, "students", [...students, { id, name: capitalizeName(name.trim()), email: email.trim() || null, phone: phone || null, cpf: cpf || null, address: address.trim() || null, birthDate: birthDate || null, plan, teacherId: null, anatomyProfile, active: true }]);
        } else {
          const teachers = readLocalCollection<RegisteredTeacher>(access.academyId, "teachers");
          writeLocalCollection(access.academyId, "teachers", [...teachers, { id, name: capitalizeName(name.trim()), email: email.trim() || null, phone: phone || null, cpf: cpf || null, birthDate: birthDate || null, cref: cref.trim() || null, specialty: capitalizeName(specialty.trim()) || null, active: true }]);
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
            <label>E-mail Google <small>(opcional — use somente se a pessoa tiver)</small><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="aluno@exemplo.com" /></label>
            {role === "student" && <><label>Telefone / WhatsApp<input value={phone} onChange={(event) => setPhone(maskPhone(event.target.value))} inputMode="tel" placeholder="(00) 00000-0000" /></label><label>CPF<input value={cpf} onChange={(event) => setCpf(maskCpf(event.target.value))} inputMode="numeric" placeholder="000.000.000-00" /></label><label>Endereço<input value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" placeholder="Rua, número, bairro e cidade" /></label></>}
            {role === "teacher" && <><label>Telefone<input value={phone} onChange={(event) => setPhone(maskPhone(event.target.value))} inputMode="tel" placeholder="(00) 00000-0000" /></label><label>CPF<input value={cpf} onChange={(event) => setCpf(maskCpf(event.target.value))} inputMode="numeric" placeholder="000.000.000-00" /></label><label>Data de nascimento<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} max={todayIso()} /></label><label>CREF<input value={cref} onChange={(event) => setCref(event.target.value.toUpperCase())} placeholder="Ex.: 012345-G/SP" /></label><label>Especialidade<input value={specialty} onChange={(event) => setSpecialty(capitalizeName(event.target.value))} placeholder="Ex.: Musculação" /></label></>}
            {role === "student" && <label>Plano<select value={plan} onChange={(event) => setPlan(event.target.value)}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></label>}
            {role === "student" && <label>Data de nascimento<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} max={todayIso()} required /><small>Usada para calcular a idade e felicitar o aluno no aniversário.</small></label>}
            {role === "student" && <label>Perfil anatômico<select value={anatomyProfile} onChange={(event) => setAnatomyProfile(event.target.value === "feminino" ? "feminino" : "masculino")}><option value="masculino">Masculino</option><option value="feminino">Feminino</option></select><small>Define o modelo exibido durante o treino.</small></label>}
            {error && <p className="auth-status" role="status">{error}</p>}
            <div className="student-modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Salvando..." : "Cadastrar e gerar código"}</button></div>
          </form>
        ) : (
          <div className="student-invite-result"><span>CADASTRO CRIADO</span><h3>{name}</h3><p>Envie este código para a pessoa. No primeiro acesso, ela escolhe “Criar acesso”, define um nome de usuário e senha (ou usa Google) e informa o código. Sem um código válido, o acesso não é liberado.</p><div className="generated-code"><code>{code}</code><button onClick={() => navigator.clipboard?.writeText(code).then(() => onFeedback("Código copiado."))}>Copiar</button></div><button className="student-modal-close" onClick={onClose}>Concluir</button></div>
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
          <div><span>{brazilLongDate()}</span><h2>{brazilGreeting()}, {firstName(registeredProfile?.name || registeredProfile?.displayName || access.user.displayName, access.user.email)}.</h2><p>Seus alunos, no ritmo certo. Acompanhe quem precisa de treino novo, revisão ou avaliação.</p></div>
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) { feedback("Informe o título e o texto do comunicado."); return; }
    setSending(true);
    const senderName = profile?.name || profile?.displayName || accountName(access.user.displayName, access.user.email);
    try {
      if (!db) {
        const announcement: AcademyAnnouncement = { id: editingId ?? `local-announcement-${Date.now()}`, title: capitalizeName(title.trim()), body: body.trim(), senderName };
        writeLocalCollection(access.academyId, "announcements", editingId ? announcements.map((item) => item.id === editingId ? announcement : item) : [announcement, ...announcements]);
      } else {
        const data = { title: capitalizeName(title.trim()), body: body.trim(), senderName, senderId: access.userId, updatedAt: serverTimestamp() };
        if (editingId) await updateDoc(doc(db, "academies", access.academyId, "announcements", editingId), data);
        else await addDoc(collection(db, "academies", access.academyId, "announcements"), { ...data, createdAt: serverTimestamp() });
      }
      setTitle(""); setBody(""); setEditingId(null); feedback(editingId ? "Comunicado atualizado." : "Comunicado publicado para toda a academia.");
    } catch { feedback("Não foi possível publicar o comunicado."); }
    finally { setSending(false); }
  }
  function editAnnouncement(item: AcademyAnnouncement) { setEditingId(item.id); setTitle(item.title); setBody(item.body); scrollToContent(".announcement-composer"); }
  async function removeAnnouncement(item: AcademyAnnouncement) {
    if (!window.confirm(`Excluir o comunicado “${item.title}”?`)) return;
    try {
      if (!db) writeLocalCollection(access.academyId, "announcements", announcements.filter((current) => current.id !== item.id));
      else await deleteDoc(doc(db, "academies", access.academyId, "announcements", item.id));
      if (editingId === item.id) { setEditingId(null); setTitle(""); setBody(""); }
      feedback("Comunicado excluído.");
    } catch { feedback("Não foi possível excluir o comunicado."); }
  }
  return <section className="workspace-panel announcement-composer">
    <header><div><span>COMUNICAÇÃO GERAL</span><h3>Comunicado da academia</h3><p>O aviso aparece na página inicial e nas notificações de todos.</p></div><Bell /></header>
    <form onSubmit={publish}><label>Título<input value={title} onChange={(event) => setTitle(capitalizeName(event.target.value))} placeholder="Ex.: Horário especial neste sábado" maxLength={80} /></label><label>Mensagem<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escreva um aviso curto e objetivo." maxLength={280} /></label><button type="submit" disabled={sending || !title.trim() || !body.trim()}>{sending ? "Salvando..." : editingId ? "Salvar comunicado" : "Publicar para todos"}</button></form>
    {announcements.slice(0, 5).map((item) => <div className="announcement-latest" key={item.id}><span>COMUNICADO PUBLICADO</span><strong>{item.title}</strong><p>{item.body}</p><div className="announcement-actions"><button type="button" onClick={() => editAnnouncement(item)}>Editar</button><button type="button" onClick={() => void removeAnnouncement(item)}>Excluir</button></div></div>)}
  </section>;
}

function AcademyFooter() {
  const access = useAccess();
  const profile = useRegisteredProfile();
  const [academy, setAcademy] = useState<{ phone?: string; instagramUrl?: string; siteUrl?: string }>({});
  useEffect(() => { if (!db) { setAcademy({ phone: profile?.phone, instagramUrl: profile?.instagramUrl, siteUrl: profile?.siteUrl }); return; } return onSnapshot(doc(db, "academies", access.academyId), (snapshot) => setAcademy(snapshot.exists() ? snapshot.data() as { phone?: string; instagramUrl?: string; siteUrl?: string } : {})); }, [access.academyId, profile?.instagramUrl, profile?.phone, profile?.siteUrl]);
  const profileFallback = access.role === "admin" ? profile : null;
  const contactPhone = academy.phone || profileFallback?.phone;
  const instagramUrl = academy.instagramUrl || profileFallback?.instagramUrl;
  const siteUrl = academy.siteUrl || profileFallback?.siteUrl;
  const whatsappNumber = contactPhone?.replace(/\D/g, "");
  const whatsappDestination = whatsappNumber?.startsWith("55") ? whatsappNumber : `55${whatsappNumber}`;
  return <footer className="academy-footer"><span>Dama de Ferro Academia</span><div>{whatsappNumber && <a href={`https://wa.me/${whatsappDestination}`} target="_blank" rel="noreferrer">WhatsApp · {contactPhone}</a>}{instagramUrl && <a href={instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}{siteUrl && <a href={siteUrl} target="_blank" rel="noreferrer">Site oficial</a>}</div></footer>;
}

