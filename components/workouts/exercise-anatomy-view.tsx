"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ArrowLeft, Dumbbell, RefreshCw, RotateCcw, Timer, ZoomIn, ZoomOut } from "lucide-react";

export type ExerciseAnatomyData = { name: string; primaryMuscle: string; secondaryMuscles?: string; anatomyProfile?: "masculino" | "feminino"; sets: number; reps: string; rest: string; };
type MuscleZone = "shoulders" | "chest" | "arms" | "back" | "core" | "glutes" | "thighs" | "calves";
type AnatomyView = "front" | "side" | "back";
const VIEW_ORDER: AnatomyView[] = ["front", "side", "back"];
const VIEW_LABEL: Record<AnatomyView, string> = { front: "Frente", side: "Lado", back: "Costas" };

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function muscleZones(value: string): Set<MuscleZone> {
  const text = normalize(value); const zones = new Set<MuscleZone>();
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

const FRONT_PATHS: Record<MuscleZone, string[]> = {
  shoulders: ["M108 130 C91 136 84 151 83 173 C92 168 102 169 116 176 L127 144 Z", "M212 130 C229 136 236 151 237 173 C228 168 218 169 204 176 L193 144 Z"],
  chest: ["M129 139 C139 127 151 126 157 132 L157 193 C139 194 125 185 118 169 Z", "M191 139 C181 127 169 126 163 132 L163 193 C181 194 195 185 202 169 Z"],
  arms: ["M80 174 C73 195 68 230 64 261 L84 265 L101 198 L101 174 Z", "M240 174 C247 195 252 230 256 261 L236 265 L219 198 L219 174 Z", "M58 292 L49 357 L62 363 L75 296 Z", "M262 292 L271 357 L258 363 L245 296 Z"],
  back: ["M116 178 C105 190 106 225 123 262 L137 230 L132 185 Z", "M204 178 C215 190 214 225 197 262 L183 230 L188 185 Z"],
  core: ["M141 196 L157 196 L157 278 L137 276 L132 239 Z", "M179 196 L163 196 L163 278 L183 276 L188 239 Z"],
  glutes: ["M128 279 C140 270 151 276 157 291 L151 321 L127 314 Z", "M192 279 C180 270 169 276 163 291 L169 321 L193 314 Z"],
  thighs: ["M124 321 L151 321 L148 416 L122 416 L116 370 Z", "M196 321 L169 321 L172 416 L198 416 L204 370 Z"],
  calves: ["M122 427 C113 451 114 488 117 516 L135 516 L145 429 Z", "M198 427 C207 451 206 488 203 516 L185 516 L175 429 Z"],
};
const SIDE_PATHS: Record<MuscleZone, string[]> = {
  shoulders: ["M164 130 C184 134 194 148 191 170 C183 178 173 179 163 170 C158 154 158 141 164 130 Z"],
  chest: ["M166 170 C186 169 195 183 190 207 C183 218 172 218 163 207 L158 182 Z"],
  arms: ["M187 176 C200 197 201 225 194 251 L184 250 L180 210 Z", "M194 254 C201 276 201 304 193 326 L183 321 L185 268 Z"],
  back: ["M143 142 C128 162 128 207 140 246 L157 236 L162 169 Z"],
  core: ["M157 210 C177 219 180 249 169 278 L150 274 L142 240 Z"],
  glutes: ["M139 274 C122 282 117 303 127 326 C140 337 154 329 160 311 L157 284 Z"],
  thighs: ["M132 326 C119 350 120 395 134 424 L153 419 L162 340 Z"],
  calves: ["M135 427 C124 450 126 486 137 515 L151 514 L158 439 Z"],
};
const BACK_PATHS: Record<MuscleZone, string[]> = { ...FRONT_PATHS, chest: [], back: ["M125 141 C136 128 151 127 158 139 L157 249 L137 251 C121 226 116 181 125 141 Z", "M195 141 C184 128 169 127 162 139 L163 249 L183 251 C199 226 204 181 195 141 Z"], glutes: ["M126 278 C140 266 153 273 158 292 L152 327 C136 331 122 320 119 302 Z", "M194 278 C180 266 167 273 162 292 L168 327 C184 331 198 320 201 302 Z"] };

function AnatomyFigure({ primary, secondary, profile, view }: { primary: Set<MuscleZone>; secondary: Set<MuscleZone>; profile: "masculino" | "feminino"; view: AnatomyView }) {
  const image = view === "back" ? "/anatomy-body-back.png" : view === "side" ? "/anatomy-body-side.png" : profile === "feminino" ? "/anatomy-body-feminine.png" : "/anatomy-body-base.png";
  const paths = view === "back" ? BACK_PATHS : view === "side" ? SIDE_PATHS : FRONT_PATHS;
  return <svg className="anatomy-image" viewBox="0 0 320 560" role="img" aria-label={`Corpo anatômico visto de ${VIEW_LABEL[view].toLowerCase()}`}>
    <defs>
      <filter id={`muscle-glow-${view}`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      <linearGradient id={`primary-${view}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ff8277" /><stop offset=".45" stopColor="#ff3838" /><stop offset="1" stopColor="#c51418" /></linearGradient>
      <linearGradient id={`secondary-${view}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffc56e" /><stop offset=".5" stopColor="#ff922e" /><stop offset="1" stopColor="#d66416" /></linearGradient>
    </defs>
    <image href={image} x="0" y="0" width="320" height="560" preserveAspectRatio="xMidYMid slice" />
    <g className="anatomy-muscle-overlay" filter={`url(#muscle-glow-${view})`}>
      {[...primary].flatMap((zone) => paths[zone].map((path, index) => <path key={`p-${zone}-${index}`} className="muscle-primary" d={path} fill={`url(#primary-${view})`} />))}
      {[...secondary].filter((zone) => !primary.has(zone)).flatMap((zone) => paths[zone].map((path, index) => <path key={`s-${zone}-${index}`} className="muscle-secondary" d={path} fill={`url(#secondary-${view})`} />))}
    </g>
  </svg>;
}

export function ExerciseAnatomyView({ exercise, onClose }: { exercise: ExerciseAnatomyData; onClose: () => void }) {
  const primaryZones = muscleZones(exercise.primaryMuscle); const secondaryZones = muscleZones(exercise.secondaryMuscles ?? "");
  const profile = exercise.anatomyProfile === "feminino" ? "feminino" : "masculino";
  const [view, setView] = useState<AnatomyView>("front"); const [zoom, setZoom] = useState(1); const dragStart = useRef<number | null>(null);
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [onClose]);
  const changeZoom = (amount: number) => setZoom((current) => Math.min(1.5, Math.max(.9, Number((current + amount).toFixed(2)))));
  const chooseView = (next: AnatomyView) => { setView(next); setZoom(1); };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { dragStart.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => { if (dragStart.current === null) return; const distance = event.clientX - dragStart.current; dragStart.current = null; if (Math.abs(distance) < 42) return; const current = VIEW_ORDER.indexOf(view); chooseView(VIEW_ORDER[(current + (distance < 0 ? 1 : VIEW_ORDER.length - 1)) % VIEW_ORDER.length]); };
  return <div className="anatomy-screen" role="dialog" aria-modal="true" aria-labelledby="anatomy-title">
    <header><button type="button" aria-label="Voltar ao treino" onClick={onClose}><ArrowLeft /></button><h2 id="anatomy-title">{exercise.name}</h2><span /></header>
    <main>
      <div className="anatomy-realistic-viewer">
        <div className="anatomy-realistic-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { dragStart.current = null; }} onWheel={(event: ReactWheelEvent<HTMLDivElement>) => { event.preventDefault(); changeZoom(event.deltaY < 0 ? .08 : -.08); }}><div className="anatomy-realistic-zoom" style={{ transform: `scale(${zoom})` }}><AnatomyFigure primary={primaryZones} secondary={secondaryZones} profile={profile} view={view} /></div></div>
        <div className="anatomy-view-presets" role="group" aria-label="Posição do corpo anatômico">{VIEW_ORDER.map((item) => <button type="button" key={item} className={view === item ? "active" : ""} onClick={() => chooseView(item)}>{VIEW_LABEL[item]}</button>)}</div>
        <div className="anatomy-controls"><span>Deslize para mudar a posição · perfil {profile}</span><div><button type="button" aria-label="Diminuir zoom" onClick={() => changeZoom(-.1)}><ZoomOut /></button><button type="button" aria-label="Restaurar zoom" onClick={() => setZoom(1)}><RotateCcw /></button><button type="button" aria-label="Aumentar zoom" onClick={() => changeZoom(.1)}><ZoomIn /></button></div></div>
      </div>
      <section className="muscle-legend"><div><i className="primary" /><span>Músculo principal</span><strong>{exercise.primaryMuscle || "Grupo principal"}</strong></div><div><i className="secondary" /><span>Auxiliares</span><strong>{exercise.secondaryMuscles || "Não informados"}</strong></div></section>
      <section className="anatomy-metrics"><div><Dumbbell /><strong>{exercise.sets}</strong><span>séries</span></div><div><RefreshCw /><strong>{exercise.reps}</strong><span>repetições</span></div><div><Timer /><strong>{exercise.rest.replace(/\s*s$/i, "")} s</strong><span>descanso</span></div></section>
    </main>
  </div>;
}
