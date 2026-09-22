"use client";

import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Clock3, Dumbbell, PersonStanding, Play, QrCode, Trophy } from "lucide-react";

export type WorkoutSessionExercise = {
  name: string;
  group: string;
  sets: number;
  reps: string;
  load: string;
  rest: string;
  gifUrl?: string;
  videoUrl?: string;
  equipmentName?: string;
  instructions?: string;
};

type Props = {
  name: string;
  elapsed: string;
  exercises: WorkoutSessionExercise[];
  completedSets: string[];
  openIndex: number | null;
  setValues: Record<string, { load: string; reps: string }>;
  restTimer: { exerciseIndex: number; total: number; remaining: number } | null;
  saving: boolean;
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

function MovementDemo({ src, name }: { src: string; name: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <figure className="workout-demo">
    {failedSource === src ? <p>Não foi possível carregar a demonstração.<button type="button" onClick={() => setFailedSource(null)}>Tentar novamente</button></p> : <img src={src} alt={`Como executar ${name}`} onError={() => setFailedSource(src)} />}
    <figcaption><Play size={13} /> Demonstração do movimento</figcaption>
  </figure>;
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
      <span className="workout-time" aria-label={`Tempo de treino: ${props.elapsed}`}><Clock3 size={15} />{props.elapsed}</span>
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
        const timedReps = /\b(s|seg|segundos|min|minutos)\b/i.test(exercise.reps);
        const panelId = `workout-exercise-${index}`;
        return <article className={`workout-exercise ${isOpen ? "is-open" : "is-closed"}${isComplete ? " is-complete" : ""}`} key={`${index}-${exercise.name}`}>
          <button className="workout-exercise-toggle" type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => props.onOpen(isOpen ? null : index)}>
            <span className="workout-exercise-meta"><span className="workout-exercise-number">{isComplete ? <Check size={15} /> : String(index + 1).padStart(2, "0")}</span><span>{exercise.group}</span><span className="workout-exercise-state">{isComplete ? "Concluído" : completed ? `${completed}/${exercise.sets} feitas` : isOpen ? "Em foco" : ""}</span></span>
            <span className="workout-exercise-name">{exercise.name}</span>
            <span className="workout-exercise-bottom"><span className="workout-exercise-prescription">{exercise.sets} séries <span aria-hidden="true">×</span> {exercise.reps}{!timedReps && " rep."}</span><span className="workout-exercise-action">{isOpen ? "Recolher" : isComplete ? "Rever" : completed ? "Continuar" : "Iniciar"}{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span></span>
          </button>
          {isOpen && <div className="workout-exercise-content" id={panelId}>
            {exercise.gifUrl && <MovementDemo src={exercise.gifUrl} name={exercise.name} />}
            {exercise.equipmentName && <p className="workout-equipment"><Dumbbell size={16} />{exercise.equipmentName}</p>}
            {hasInstructions && <details className="workout-instructions"><summary>Orientação do professor<ChevronDown size={16} /></summary><p>{instructions}</p></details>}
            <div className="workout-detail-actions">
              <button type="button" onClick={() => props.onAnatomy(index)}><PersonStanding size={18} />Ver músculos<ChevronRight size={15} /></button>
              {exercise.videoUrl && <a href={exercise.videoUrl} target="_blank" rel="noreferrer"><Play size={16} />Ver vídeo</a>}
            </div>
            <div className="workout-set-heading"><h3>Suas séries</h3><span>{completed}/{exercise.sets} feitas</span></div>
            <div className="workout-set-labels" aria-hidden="true"><span>Série</span><span>Carga (kg)</span><span>{timedReps ? "Duração" : "Repetições"}</span><span>Feito</span></div>
            {Array.from({ length: exercise.sets }).map((_, set) => {
              const id = `${index}-${set}`;
              const done = completedSets.includes(id);
              return <div className={`workout-set${done ? " is-done" : ""}`} key={id}>
                <span>{String(set + 1).padStart(2, "0")}</span>
                <input aria-label={`Carga da série ${set + 1} de ${exercise.name}`} inputMode="decimal" value={props.setValues[id]?.load ?? exercise.load} onChange={(event) => props.onValueChange(id, "load", event.target.value, exercise)} />
                <input aria-label={`Repetições da série ${set + 1} de ${exercise.name}`} inputMode="numeric" value={props.setValues[id]?.reps ?? exercise.reps} onChange={(event) => props.onValueChange(id, "reps", event.target.value, exercise)} />
                <button type="button" aria-pressed={done} aria-label={`${done ? "Desmarcar" : "Concluir"} série ${set + 1} de ${exercise.name}`} onClick={() => props.onToggleSet(index, set)}><Check size={20} /></button>
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
