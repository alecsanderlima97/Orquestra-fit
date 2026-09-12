"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, Dumbbell, RefreshCw, RotateCcw, Timer, ZoomIn, ZoomOut } from "lucide-react";

export type ExerciseAnatomyData = {
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string;
  anatomyProfile?: "masculino" | "feminino";
  sets: number;
  reps: string;
  rest: string;
};

type MuscleZone = "shoulders" | "chest" | "arms" | "back" | "core" | "glutes" | "thighs" | "calves";
type AnatomyProfile = "masculino" | "feminino";
type AnatomySide = "front" | "back";

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

function AnatomyFigure({ primary, secondary, profile, side }: { primary: Set<MuscleZone>; secondary: Set<MuscleZone>; profile: AnatomyProfile; side: AnatomySide }) {
  const tone = (zone: MuscleZone) => primary.has(zone) ? "muscle-primary" : secondary.has(zone) ? "muscle-secondary" : "muscle-base";
  const fill = (zone: MuscleZone) => primary.has(zone) ? "url(#muscle-primary-gradient)" : secondary.has(zone) ? "url(#muscle-secondary-gradient)" : "#4f5d62";
  const image = side === "back" ? "/anatomy-body-back.png" : profile === "feminino" ? "/anatomy-body-feminine.png" : "/anatomy-body-base.png";
  return (
    <svg className={`anatomy-figure anatomy-figure-${side}`} viewBox="0 0 320 560" role="img" aria-label={`Mapa muscular ${side === "front" ? "frontal" : "posterior"} do exercício`}>
      <defs>
        <radialGradient id="muscle-primary-gradient" cx="48%" cy="38%" r="72%"><stop offset="0" stopColor="#ff8c83" /><stop offset=".42" stopColor="#fb4e4e" /><stop offset="1" stopColor="#b51f2c" /></radialGradient>
        <radialGradient id="muscle-secondary-gradient" cx="48%" cy="38%" r="72%"><stop offset="0" stopColor="#ffd692" /><stop offset=".42" stopColor="#ff9a36" /><stop offset="1" stopColor="#bf5d13" /></radialGradient>
        <filter id="muscle-glow"><feGaussianBlur stdDeviation="1.8" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <image href={image} x="0" y="0" width="320" height="560" preserveAspectRatio="xMidYMid slice" className="anatomy-real-body" />
      <g className="anatomy-muscle-overlay" filter="url(#muscle-glow)" stroke="#150807" strokeWidth="1">
        <path className={tone("shoulders")} fill={fill("shoulders")} d="M108 130 C91 136 84 151 83 173 C92 168 102 169 116 176 L127 144 Z" />
        <path className={tone("shoulders")} fill={fill("shoulders")} d="M212 130 C229 136 236 151 237 173 C228 168 218 169 204 176 L193 144 Z" />
        <path className={tone("chest")} fill={fill("chest")} d="M129 139 C139 127 151 126 157 132 L157 193 C139 194 125 185 118 169 Z" />
        <path className={tone("chest")} fill={fill("chest")} d="M191 139 C181 127 169 126 163 132 L163 193 C181 194 195 185 202 169 Z" />
        <path className={tone("back")} fill={fill("back")} d="M116 178 C105 190 106 225 123 262 L137 230 L132 185 Z" />
        <path className={tone("back")} fill={fill("back")} d="M204 178 C215 190 214 225 197 262 L183 230 L188 185 Z" />
        <path className={tone("arms")} fill={fill("arms")} d="M80 174 C73 195 68 230 64 261 L84 265 L101 198 L101 174 Z" />
        <path className={tone("arms")} fill={fill("arms")} d="M240 174 C247 195 252 230 256 261 L236 265 L219 198 L219 174 Z" />
        <path className={tone("arms")} fill={fill("arms")} d="M58 292 L49 357 L62 363 L75 296 Z" />
        <path className={tone("arms")} fill={fill("arms")} d="M262 292 L271 357 L258 363 L245 296 Z" />
        <path className={tone("core")} fill={fill("core")} d="M141 196 L157 196 L157 278 L137 276 L132 239 Z" />
        <path className={tone("core")} fill={fill("core")} d="M179 196 L163 196 L163 278 L183 276 L188 239 Z" />
        <path className={tone("glutes")} fill={fill("glutes")} d="M128 279 C140 270 151 276 157 291 L151 321 L127 314 Z" />
        <path className={tone("glutes")} fill={fill("glutes")} d="M192 279 C180 270 169 276 163 291 L169 321 L193 314 Z" />
        <path className={tone("thighs")} fill={fill("thighs")} d="M124 321 L151 321 L148 416 L122 416 L116 370 Z" />
        <path className={tone("thighs")} fill={fill("thighs")} d="M196 321 L169 321 L172 416 L198 416 L204 370 Z" />
        <path className={tone("calves")} fill={fill("calves")} d="M122 427 C113 451 114 488 117 516 L135 516 L145 429 Z" />
        <path className={tone("calves")} fill={fill("calves")} d="M198 427 C207 451 206 488 203 516 L185 516 L175 429 Z" />
      </g>
    </svg>
  );
}

export function ExerciseAnatomyView({ exercise, onClose }: { exercise: ExerciseAnatomyData; onClose: () => void }) {
  const primaryZones = muscleZones(exercise.primaryMuscle);
  const secondaryZones = muscleZones(exercise.secondaryMuscles ?? "");
  const profile: AnatomyProfile = exercise.anatomyProfile === "feminino" ? "feminino" : "masculino";
  const [rotation, setRotation] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinchDistance = useRef<number | null>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const updateZoom = (amount: number) => setZoom((current) => Math.min(1.42, Math.max(.82, Number((current + amount).toFixed(2)))));
  const resetView = () => { setRotation(0); setTilt(0); setZoom(1); };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 1) {
      setRotation((current) => current + (event.clientX - previous.x) * .55);
      setTilt((current) => Math.min(9, Math.max(-9, current - (event.clientY - previous.y) * .12)));
      return;
    }
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (lastPinchDistance.current !== null) updateZoom((distance - lastPinchDistance.current) * .006);
    lastPinchDistance.current = distance;
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) lastPinchDistance.current = null;
  };

  return (
    <div className="anatomy-screen" role="dialog" aria-modal="true" aria-labelledby="anatomy-title">
      <header><button type="button" aria-label="Voltar ao treino" onClick={onClose}><ArrowLeft /></button><h2 id="anatomy-title">{exercise.name}</h2><span /></header>
      <main>
        <div className="anatomy-stage">
          <div className="anatomy-viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onWheel={(event) => { event.preventDefault(); updateZoom(event.deltaY < 0 ? .08 : -.08); }}>
            <div className="anatomy-orbit" style={{ transform: `rotateX(${tilt}deg) rotateY(${rotation}deg) scale(${zoom})` }}>
              <AnatomyFigure primary={primaryZones} secondary={secondaryZones} profile={profile} side="front" />
              <AnatomyFigure primary={primaryZones} secondary={secondaryZones} profile={profile} side="back" />
            </div>
          </div>
        </div>
        <div className="anatomy-controls" aria-label="Controles da visualização anatômica">
          <span>Arraste para girar · use dois dedos para zoom</span>
          <div><button type="button" aria-label="Diminuir zoom" onClick={() => updateZoom(-.1)}><ZoomOut /></button><button type="button" aria-label="Restaurar visualização" onClick={resetView}><RotateCcw /></button><button type="button" aria-label="Aumentar zoom" onClick={() => updateZoom(.1)}><ZoomIn /></button></div>
        </div>
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
