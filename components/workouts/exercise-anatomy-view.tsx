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
  shoulders: ["M110 99 C92 102 82 116 83 140 C89 150 99 151 109 143 L124 111 C121 104 116 100 110 99 Z", "M210 99 C228 102 238 116 237 140 C231 150 221 151 211 143 L196 111 C199 104 204 100 210 99 Z"],
  chest: ["M126 107 C136 100 149 100 157 107 L157 154 C143 159 128 154 117 143 L113 121 C116 114 120 110 126 107 Z", "M194 107 C184 100 171 100 163 107 L163 154 C177 159 192 154 203 143 L207 121 C204 114 200 110 194 107 Z"],
  arms: ["M91 137 C79 146 73 166 76 188 C82 195 90 193 98 185 L108 149 C104 140 99 136 91 137 Z", "M229 137 C241 146 247 166 244 188 C238 195 230 193 222 185 L212 149 C216 140 221 136 229 137 Z", "M75 188 C65 199 56 224 51 254 C55 261 62 263 70 258 L87 207 C86 197 82 191 75 188 Z", "M245 188 C255 199 264 224 269 254 C265 261 258 263 250 258 L233 207 C234 197 238 191 245 188 Z"],
  back: ["M116 153 C105 169 106 207 121 232 L137 222 L134 166 Z", "M204 153 C215 169 214 207 199 232 L183 222 L186 166 Z"],
  core: ["M137 154 C144 158 151 159 157 157 L157 252 L139 249 C130 222 128 185 137 154 Z", "M183 154 C176 158 169 159 163 157 L163 252 L181 249 C190 222 192 185 183 154 Z"],
  glutes: ["M128 236 C140 230 151 236 157 252 L151 281 L127 279 C120 263 121 247 128 236 Z", "M192 236 C180 230 169 236 163 252 L169 281 L193 279 C200 263 199 247 192 236 Z"],
  thighs: ["M123 246 C133 239 144 241 151 251 L148 340 C143 354 135 359 124 352 C116 324 115 273 123 246 Z", "M197 246 C187 239 176 241 169 251 L172 340 C177 354 185 359 196 352 C204 324 205 273 197 246 Z"],
  calves: ["M123 382 C113 401 112 454 121 493 C127 501 134 498 138 488 L145 399 C139 386 132 380 123 382 Z", "M197 382 C207 401 208 454 199 493 C193 501 186 498 182 488 L175 399 C181 386 188 380 197 382 Z"],
};
const SIDE_PATHS: Record<MuscleZone, string[]> = {
  shoulders: ["M145 91 C160 88 174 99 177 118 C174 135 164 144 151 140 C142 130 138 105 145 91 Z"],
  chest: ["M174 102 C189 108 195 123 191 143 C185 152 176 153 166 146 L158 119 C162 109 167 104 174 102 Z"],
  arms: ["M151 132 C164 137 169 157 165 184 C159 194 152 194 146 184 L140 150 C142 141 145 135 151 132 Z", "M157 184 C166 204 170 232 167 257 C161 266 154 263 150 253 L143 205 C146 194 150 188 157 184 Z"],
  back: ["M136 78 C124 103 125 160 137 213 L151 207 L153 112 C149 92 144 81 136 78 Z"],
  core: ["M163 143 C176 157 180 195 173 228 L158 229 L148 178 C150 158 155 147 163 143 Z"],
  glutes: ["M133 220 C119 230 115 257 126 283 C136 294 149 290 157 275 L155 235 C149 225 142 220 133 220 Z"],
  thighs: ["M137 276 C126 290 123 323 131 354 C137 365 145 365 151 355 L158 292 C153 280 146 275 137 276 Z"],
  calves: ["M133 371 C122 393 123 449 134 489 C140 498 147 495 150 482 L154 391 C149 379 142 372 133 371 Z"],
};
const BACK_PATHS: Record<MuscleZone, string[]> = { ...FRONT_PATHS, chest: [], core: [], back: ["M124 106 C136 96 150 97 158 108 L157 228 L137 232 C121 210 116 144 124 106 Z", "M196 106 C184 96 170 97 162 108 L163 228 L183 232 C199 210 204 144 196 106 Z"], glutes: ["M126 229 C139 219 152 225 158 243 L152 282 C137 289 122 280 118 261 Z", "M194 229 C181 219 168 225 162 243 L168 282 C183 289 198 280 202 261 Z"] };

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
