"use client";

import { useEffect } from "react";
import { ArrowLeft, Dumbbell, RefreshCw, Timer } from "lucide-react";
import { AnatomyModel3D, type AnatomyMuscleZone } from "./anatomy-model-3d";

export type ExerciseAnatomyData = {
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string;
  anatomyProfile?: "masculino" | "feminino";
  sets: number;
  reps: string;
  rest: string;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function muscleZones(value: string): Set<AnatomyMuscleZone> {
  const text = normalize(value);
  const zones = new Set<AnatomyMuscleZone>();
  if (/ombro|deltoide/.test(text)) zones.add("shoulders");
  if (/peito|peitoral/.test(text)) zones.add("chest");
  if (/biceps|triceps|braco|antebraco/.test(text)) zones.add("arms");
  if (/costas|dorsal|trapezio|lombar/.test(text)) zones.add("back");
  if (/abdomen|abdominal|core|central/.test(text)) zones.add("core");
  if (/gluteo|quadril/.test(text)) zones.add("glutes");
  if (/quadriceps|posterior|coxa|adutor|perna/.test(text)) zones.add("thighs");
  if (/panturrilha/.test(text)) zones.add("calves");
  return zones;
}

export function ExerciseAnatomyView({ exercise, onClose }: { exercise: ExerciseAnatomyData; onClose: () => void }) {
  const primaryZones = muscleZones(exercise.primaryMuscle);
  const secondaryZones = muscleZones(exercise.secondaryMuscles ?? "");
  const profile = exercise.anatomyProfile === "feminino" ? "feminino" : "masculino";

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="anatomy-screen" role="dialog" aria-modal="true" aria-labelledby="anatomy-title">
    <header><button type="button" aria-label="Voltar ao treino" onClick={onClose}><ArrowLeft /></button><h2 id="anatomy-title">{exercise.name}</h2><span /></header>
    <main>
      <AnatomyModel3D primary={primaryZones} secondary={secondaryZones} profile={profile} />
      <section className="muscle-legend">
        <div><i className="primary" /><span>Músculo principal</span><strong>{exercise.primaryMuscle || "Grupo principal"}</strong></div>
        <div><i className="secondary" /><span>Auxiliares</span><strong>{exercise.secondaryMuscles || "Não informados"}</strong></div>
      </section>
      <section className="anatomy-metrics">
        <div><Dumbbell /><strong>{exercise.sets}</strong><span>séries</span></div>
        <div><RefreshCw /><strong>{exercise.reps}</strong><span>repetições</span></div>
        <div><Timer /><strong>{exercise.rest.replace(/\s*s$/i, "")} s</strong><span>descanso</span></div>
      </section>
    </main>
  </div>;
}
