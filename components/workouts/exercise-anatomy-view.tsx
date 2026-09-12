"use client";

import { useEffect } from "react";
import { ArrowLeft, Dumbbell, RefreshCw, Timer } from "lucide-react";

export type ExerciseAnatomyData = {
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string;
  sets: number;
  reps: string;
  rest: string;
};

type MuscleZone = "shoulders" | "chest" | "arms" | "back" | "core" | "glutes" | "thighs" | "calves";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function muscleZones(value: string): Set<MuscleZone> {
  const text = normalize(value);
  const zones = new Set<MuscleZone>();
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

function AnatomyFigure({ primary, secondary }: { primary: Set<MuscleZone>; secondary: Set<MuscleZone> }) {
  const tone = (zone: MuscleZone) => primary.has(zone) ? "muscle-primary" : secondary.has(zone) ? "muscle-secondary" : "muscle-base";
  return (
    <svg className="anatomy-figure" viewBox="0 0 320 560" role="img" aria-label="Mapa muscular do exercício">
      <defs>
        <radialGradient id="body-glow" cx="50%" cy="42%" r="62%"><stop offset="0" stopColor="#2a363b" stopOpacity=".72" /><stop offset="1" stopColor="#071014" stopOpacity="0" /></radialGradient>
        <linearGradient id="body-metal" x1="0" x2="1"><stop offset="0" stopColor="#475158" /><stop offset=".5" stopColor="#8c969a" /><stop offset="1" stopColor="#3f494f" /></linearGradient>
        <filter id="muscle-glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <ellipse cx="160" cy="300" rx="150" ry="250" fill="url(#body-glow)" />
      <g className="body-silhouette" fill="url(#body-metal)" stroke="#aab3b7" strokeWidth="1.3">
        <ellipse cx="160" cy="55" rx="32" ry="40" />
        <path d="M143 91 L177 91 L184 119 L210 133 L222 215 L198 286 L188 314 L132 314 L122 286 L98 215 L110 133 L136 119 Z" />
        <path d="M108 130 C87 136 78 158 73 192 L57 284 L78 290 L103 213 L122 159 Z" />
        <path d="M212 130 C233 136 242 158 247 192 L263 284 L242 290 L217 213 L198 159 Z" />
        <path d="M58 282 L45 371 L62 377 L80 289 Z" />
        <path d="M262 282 L275 371 L258 377 L240 289 Z" />
        <path d="M133 309 L153 311 L151 430 L137 532 L112 532 L119 426 Z" />
        <path d="M187 309 L167 311 L169 430 L183 532 L208 532 L201 426 Z" />
      </g>
      <g filter="url(#muscle-glow)" stroke="#150807" strokeWidth="1">
        <path className={tone("shoulders")} d="M108 130 C91 136 84 151 83 173 C92 168 102 169 116 176 L127 144 Z" />
        <path className={tone("shoulders")} d="M212 130 C229 136 236 151 237 173 C228 168 218 169 204 176 L193 144 Z" />
        <path className={tone("chest")} d="M129 139 C139 127 151 126 157 132 L157 193 C139 194 125 185 118 169 Z" />
        <path className={tone("chest")} d="M191 139 C181 127 169 126 163 132 L163 193 C181 194 195 185 202 169 Z" />
        <path className={tone("back")} d="M116 178 C105 190 106 225 123 262 L137 230 L132 185 Z" />
        <path className={tone("back")} d="M204 178 C215 190 214 225 197 262 L183 230 L188 185 Z" />
        <path className={tone("arms")} d="M80 174 C73 195 68 230 64 261 L84 265 L101 198 L101 174 Z" />
        <path className={tone("arms")} d="M240 174 C247 195 252 230 256 261 L236 265 L219 198 L219 174 Z" />
        <path className={tone("arms")} d="M58 292 L49 357 L62 363 L75 296 Z" />
        <path className={tone("arms")} d="M262 292 L271 357 L258 363 L245 296 Z" />
        <path className={tone("core")} d="M141 196 L157 196 L157 278 L137 276 L132 239 Z" />
        <path className={tone("core")} d="M179 196 L163 196 L163 278 L183 276 L188 239 Z" />
        <path className={tone("glutes")} d="M128 279 C140 270 151 276 157 291 L151 321 L127 314 Z" />
        <path className={tone("glutes")} d="M192 279 C180 270 169 276 163 291 L169 321 L193 314 Z" />
        <path className={tone("thighs")} d="M124 321 L151 321 L148 416 L122 416 L116 370 Z" />
        <path className={tone("thighs")} d="M196 321 L169 321 L172 416 L198 416 L204 370 Z" />
        <path className={tone("calves")} d="M122 427 C113 451 114 488 117 516 L135 516 L145 429 Z" />
        <path className={tone("calves")} d="M198 427 C207 451 206 488 203 516 L185 516 L175 429 Z" />
      </g>
      <g className="anatomy-lines" stroke="#c7d0d3" strokeOpacity=".34" fill="none">
        <path d="M160 96 V313" /><path d="M137 213 H183" /><path d="M134 238 H186" /><path d="M131 263 H189" />
        <path d="M122 359 L148 337" /><path d="M198 359 L172 337" /><path d="M120 382 L148 361" /><path d="M200 382 L172 361" />
      </g>
    </svg>
  );
}

export function ExerciseAnatomyView({ exercise, onClose }: { exercise: ExerciseAnatomyData; onClose: () => void }) {
  const primaryZones = muscleZones(exercise.primaryMuscle);
  const secondaryZones = muscleZones(exercise.secondaryMuscles ?? "");
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="anatomy-screen" role="dialog" aria-modal="true" aria-labelledby="anatomy-title">
      <header><button type="button" aria-label="Voltar ao treino" onClick={onClose}><ArrowLeft /></button><h2 id="anatomy-title">{exercise.name}</h2><span /></header>
      <main>
        <div className="anatomy-stage"><AnatomyFigure primary={primaryZones} secondary={secondaryZones} /></div>
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
    </div>
  );
}
