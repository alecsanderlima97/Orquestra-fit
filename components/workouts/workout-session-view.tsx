"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { SessionClock } from "@/lib/workouts/session-clock";
import { ArrowLeft, Check, ChevronDown, ChevronRight, ChevronUp, Clock3, Dumbbell, PersonStanding, Play, QrCode, Trophy } from "lucide-react";

export type WorkoutSessionExercise = {
  name: string;
  group: string;
  sets: number;
  reps: string;
  load: string;
  rest: string;
  gifUrl?: string;
  gifLoading?: boolean;
  videoUrl?: string;
  equipmentName?: string;
  instructions?: string;
  metricMode?: "strength" | "cardio" | "timed";
};

type Props = {
  name: string;
  clock: SessionClock;
  exercises: WorkoutSessionExercise[];
  completedSets: string[];
  openIndex: number | null;
  setValues: Record<string, { load: string; reps: string }>;
  restTimer: { exerciseIndex: number; total: number; remaining: number } | null;
  saving: boolean;
  previousSets?: Record<string, { load: string; reps: string }>;
  onBack: () => void;
  onOpen: (index: number | null) => void;
  onToggleSet: (exerciseIndex: number, setIndex: number) => void;
  onValueChange: (id: string, field: "load" | "reps", value: string, exercise: WorkoutSessionExercise) => void;
  onRest: (index: number) => void;
  onStopRest: () => void;
  onAnatomy: (index: number) => void;
  onScan: () => void;
  onFinish: () => void;
};

const MovementDemo = memo(function MovementDemo({ src, name }: { src: string; name: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const figure = useRef<HTMLElement>(null);
  useEffect(() => {
    // Do not start decoding while the card is still opening. GIF decoding happens
    // outside React but can still compete with the first touch/scroll on entry-level
    // phones, so give the browser an idle window after the interaction settles.
    let cancelled = false;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const startDecoding = () => {
      if (!cancelled) setReady(true);
    };
    const idleHandle = idleWindow.requestIdleCallback?.(startDecoding, { timeout: 900 });
    const readyTimer = idleHandle === undefined ? window.setTimeout(startDecoding, 480) : undefined;
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "150px" });
    if (figure.current) observer?.observe(figure.current);
    return () => {
      cancelled = true;
      if (readyTimer !== undefined) window.clearTimeout(readyTimer);
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  const playing = ready && visible && pageVisible;
  return <figure className="workout-demo" ref={figure}>
    <div className="workout-demo-stage">
      {failedSource === src ? <p>Não foi possível carregar a demonstração.<button type="button" onClick={() => setFailedSource(null)}>Tentar novamente</button></p> : <>
        {playing && <img src={src} loading="lazy" fetchPriority="low" decoding="async" alt={`Como executar ${name}`} onLoad={() => setLoadedSource(src)} onError={() => setFailedSource(src)} />}
        {(!playing || loadedSource !== src) && <span className="workout-demo-status" role="status">{!visible || !pageVisible ? "Demonstração pausada fora da tela" : "Carregando demonstração…"}</span>}
      </>}
    </div>
    <figcaption><Play size={13} /> Demonstração do movimento</figcaption>
  </figure>;
});

function MovementDemoPlaceholder() {
  return <figure className="workout-demo workout-demo-pending">
    <div className="workout-demo-stage"><span className="workout-demo-status" role="status">Preparando uma demonstração leve para este aparelho…</span></div>
    <figcaption><Play size={13} /> Demonstração do movimento</figcaption>
  </figure>;
}

function WorkoutTime({ clock }: { clock: SessionClock }) {
  const [seconds, setSeconds] = useState(() => clock.getSeconds());
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(clock.getSeconds()), 1000);
    return () => window.clearInterval(timer);
  }, [clock]);
  const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <span className="workout-time" aria-label={`Tempo de treino: ${elapsed}`}><Clock3 size={15} />{elapsed}</span>;
}

function parseMetricValue(value: string) {
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricStep(exercise: WorkoutSessionExercise, field: "load" | "reps") {
  if (field === "load") return exercise.metricMode === "cardio" ? 0.1 : 1;
  return exercise.metricMode === "timed" ? 5 : 1;
}

function formatMetricValue(value: number, step: number) {
  const safeValue = Math.max(0, value);
  if (step < 1) return safeValue.toFixed(1).replace(".", ",");
  return String(Math.round(safeValue));
}

function MetricStepper({
  id,
  field,
  label,
  value,
  exercise,
  onValueChange,
}: {
  id: string;
  field: "load" | "reps";
  label: string;
  value: string;
  exercise: WorkoutSessionExercise;
  onValueChange: Props["onValueChange"];
}) {
  const step = metricStep(exercise, field);
  const update = (direction: 1 | -1) => {
    const nextValue = parseMetricValue(value) + direction * step;
    onValueChange(id, field, formatMetricValue(nextValue, step), exercise);
  };

  return <div className="workout-stepper">
    <input
      aria-label={label}
      inputMode={field === "load" || exercise.metricMode === "cardio" ? "decimal" : "numeric"}
      value={value}
      onChange={(event) => onValueChange(id, field, event.target.value, exercise)}
    />
    <span className="workout-stepper-arrows" aria-label={`Ajustar ${label}`}>
      <button type="button" aria-label={`Aumentar ${label}`} onClick={() => update(1)}><ChevronUp size={13} /></button>
      <button type="button" aria-label={`Diminuir ${label}`} onClick={() => update(-1)}><ChevronDown size={13} /></button>
    </span>
  </div>;
}

export function WorkoutSessionView(props: Props) {
  const { exercises, completedSets, openIndex, restTimer } = props;
  const totalSets = exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  const doneSets = exercises.reduce((sum, exercise, index) => sum + Array.from({ length: exercise.sets }).filter((_, set) => completedSets.includes(`${index}-${set}`)).length, 0);
  const progress = totalSets ? Math.round(doneSets / totalSets * 100) : 0;
  const restLabel = restTimer ? `${String(Math.floor(restTimer.remaining / 60)).padStart(2, "0")}:${String(restTimer.remaining % 60).padStart(2, "0")}` : "";

  return <div className="workout-flow">
    <header className="workout-topbar">
      <button type="button" className="workout-back" aria-label="Voltar aos treinos" onClick={props.onBack}><ArrowLeft size={20} /></button>
      <span>Seu treino</span>
      <WorkoutTime clock={props.clock} />
    </header>

    <section className="workout-overview" aria-labelledby="workout-heading">
      <span className="workout-eyebrow">TREINO EM ANDAMENTO</span>
      <h1 id="workout-heading">{props.name}</h1>
      <p>{exercises.length} exercícios <span aria-hidden="true">·</span> Um passo de cada vez.</p>
      <div className="workout-progress-label"><span>{doneSets} de {totalSets} séries concluídas</span><strong>{progress}%</strong></div>
      <div className="workout-progress" role="progressbar" aria-label="Progresso do treino" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
    </section>

    <button type="button" className="workout-scan" onClick={props.onScan}><QrCode size={21} /><span>Ler QR da máquina</span><ChevronRight size={17} /></button>

    {restTimer && <aside className="workout-rest-banner" aria-label="Descanso em andamento">
      <Clock3 size={20} /><div><span>Recupere o fôlego</span><strong role="timer" aria-live="off">{restLabel}</strong></div>
      <button type="button" onClick={props.onStopRest}>Encerrar descanso</button>
    </aside>}

    <section className="workout-exercise-list" aria-label="Exercícios do treino">
      <div className="workout-list-heading"><h2>Seus exercícios</h2><span>Toque para abrir</span></div>
      {exercises.map((exercise, index) => {
        const isOpen = openIndex === index;
        const completed = Array.from({ length: exercise.sets }).filter((_, set) => completedSets.includes(`${index}-${set}`)).length;
        const isComplete = completed === exercise.sets;
        const isResting = restTimer?.exerciseIndex === index;
        const instructions = exercise.instructions?.trim();
        const hasInstructions = instructions && instructions !== "Orientação objetiva será adicionada pelo professor.";
        const metricLabels = exercise.metricMode === "cardio"
          ? { sets: "Blocos", reps: "Tempo", load: "Velocidade", repsUnit: "min", loadUnit: "km/h" }
          : exercise.metricMode === "timed"
            ? { sets: "Séries", reps: "Tempo", load: "Intensidade", repsUnit: "s", loadUnit: "" }
            : { sets: "Séries", reps: "Repetições", load: "Carga", repsUnit: "rep.", loadUnit: "kg" };
        const panelId = `workout-exercise-${index}`;
        if (isComplete && !isOpen) return <article className="workout-exercise is-complete is-collapsed" data-workout-index={index} key={`${index}-${exercise.name}`}>
          <button className="workout-exercise-complete-summary" type="button" aria-expanded="false" aria-controls={panelId} onClick={() => props.onOpen(index)}>
            <span className="workout-complete-icon"><Check size={17} /></span>
            <span><small>EXERCÍCIO CONCLUÍDO</small><strong>{exercise.name}</strong></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </article>;
        return <article className={`workout-exercise ${isOpen ? "is-open" : "is-closed"}${isComplete ? " is-complete" : ""}`} data-workout-index={index} key={`${index}-${exercise.name}`}>
          <button className="workout-exercise-toggle" type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => props.onOpen(isOpen ? null : index)}>
            <span className="workout-exercise-meta"><span className="workout-exercise-number">{isComplete ? <Check size={15} /> : String(index + 1).padStart(2, "0")}</span><span>{exercise.group}</span><span className="workout-exercise-state">{isComplete ? "Concluído" : completed ? `${completed}/${exercise.sets} feitas` : isOpen ? "Em foco" : ""}</span></span>
            <span className="workout-exercise-name">{exercise.name}</span>
            <span className="workout-exercise-bottom"><span className="workout-exercise-prescription">{exercise.sets} {metricLabels.sets.toLocaleLowerCase("pt-BR")} <span aria-hidden="true">×</span> {exercise.reps} {metricLabels.repsUnit}</span><span className="workout-exercise-action">{isOpen ? "Recolher" : isComplete ? "Rever" : completed ? "Continuar" : "Iniciar"}{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span></span>
          </button>
          {isOpen && <div className="workout-exercise-content" id={panelId}>
            {exercise.gifLoading ? <MovementDemoPlaceholder /> : exercise.gifUrl && <MovementDemo src={exercise.gifUrl} name={exercise.name} />}
            {exercise.equipmentName && <p className="workout-equipment"><Dumbbell size={16} />{exercise.equipmentName}</p>}
            {hasInstructions && <details className="workout-instructions"><summary>Orientação do professor<ChevronDown size={16} /></summary><p>{instructions}</p></details>}
            <div className="workout-detail-actions">
              <button type="button" onClick={() => props.onAnatomy(index)}><PersonStanding size={18} />Ver músculos<ChevronRight size={15} /></button>
              {exercise.videoUrl && <a href={exercise.videoUrl} target="_blank" rel="noreferrer"><Play size={16} />Ver vídeo</a>}
            </div>
            <div className="workout-set-heading"><h3>Suas séries</h3><span>{completed}/{exercise.sets} feitas</span></div>
            {props.previousSets?.[exercise.name] && <p className="workout-previous-performance">Último treino: <strong>{props.previousSets[exercise.name].load || "—"}{exercise.metricMode === "strength" ? " kg" : ""} · {props.previousSets[exercise.name].reps || "—"} {metricLabels.repsUnit}</strong></p>}
            <div className="workout-set-labels" aria-hidden="true"><span>Série</span><span>{metricLabels.load}{metricLabels.loadUnit ? ` (${metricLabels.loadUnit})` : ""}</span><span>{metricLabels.reps}{metricLabels.repsUnit ? ` (${metricLabels.repsUnit})` : ""}</span><span>Feito</span></div>
            {Array.from({ length: exercise.sets }).map((_, set) => {
              const id = `${index}-${set}`;
              const done = completedSets.includes(id);
              return <div className={`workout-set${done ? " is-done" : ""}`} key={id}>
                <span>{String(set + 1).padStart(2, "0")}</span>
                <MetricStepper id={id} field="load" label={`${metricLabels.load} da série ${set + 1} de ${exercise.name}`} value={props.setValues[id]?.load ?? exercise.load} exercise={exercise} onValueChange={props.onValueChange} />
                <MetricStepper id={id} field="reps" label={`${metricLabels.reps} da série ${set + 1} de ${exercise.name}`} value={props.setValues[id]?.reps ?? exercise.reps} exercise={exercise} onValueChange={props.onValueChange} />
                <button className="workout-set-toggle" type="button" aria-pressed={done} aria-label={`${done ? "Desmarcar" : "Concluir"} série ${set + 1} de ${exercise.name}`} onClick={() => props.onToggleSet(index, set)}>
                  <span className="workout-set-toggle-track" aria-hidden="true"><span className="workout-set-toggle-thumb" /></span>
                </button>
              </div>;
            })}
            <button type="button" className={`workout-rest${isResting ? " is-running" : ""}`} onClick={() => isResting ? props.onStopRest() : props.onRest(index)}><Clock3 size={18} /><span>{isResting ? `Descanso · ${restLabel}` : `Descanso de ${exercise.rest}`}</span><strong>{isResting ? "Encerrar" : "Iniciar"}</strong></button>
          </div>}
        </article>;
      })}
    </section>
    <footer className="workout-finish">
      <button type="button" disabled={!totalSets || doneSets < totalSets || props.saving} onClick={props.onFinish}><Trophy size={20} />{props.saving ? "Salvando treino…" : "Concluir treino"}</button>
      <p>{doneSets < totalSets ? "Marque as séries realizadas para concluir." : "Todas as séries feitas. Hora de registrar sua conquista."}</p>
    </footer>
  </div>;
}
