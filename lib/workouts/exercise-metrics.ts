export type ExerciseMetricSource = { name: string; exerciseType?: string; equipmentName?: string; muscleGroup?: string };
type ExerciseMetricLabels = { mode: "strength" | "cardio" | "timed"; sets: string; reps: string; load: string; rest: string; repsUnit: string; loadUnit: string; repsInputMode: "numeric" | "decimal"; loadInputMode: "numeric" | "decimal" };

export function exerciseMetricLabels(exercise: ExerciseMetricSource): ExerciseMetricLabels {
  const text = `${exercise.name} ${exercise.equipmentName ?? ""} ${exercise.muscleGroup ?? ""}`.toLocaleLowerCase("pt-BR");
  const isCardio = exercise.exerciseType === "Cardio" || /bicicleta|bike|esteira|corrida|caminhada|elípt|elipt|remo ergométrico|escada ergométrica|transport|stair|air bike|cardio/.test(text);
  if (isCardio) return { mode: "cardio", sets: "Blocos", reps: "Tempo", load: "Velocidade", rest: "Recuperação", repsUnit: "min", loadUnit: "km/h", repsInputMode: "decimal", loadInputMode: "decimal" };
  const isTimed = exercise.exerciseType === "Alongamento" || /alongamento|mobilidade|prancha|isometr|wall sit/.test(text);
  if (isTimed) return { mode: "timed", sets: "Séries", reps: "Tempo", load: "Intensidade", rest: "Descanso", repsUnit: "s", loadUnit: "", repsInputMode: "numeric", loadInputMode: "numeric" };
  return { mode: "strength", sets: "Séries", reps: "Repetições", load: "Carga", rest: "Descanso", repsUnit: "rep.", loadUnit: "kg", repsInputMode: "numeric", loadInputMode: "decimal" };
}
