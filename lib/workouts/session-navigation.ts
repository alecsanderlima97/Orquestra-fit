export function nextPendingExercise(
  exercises: ReadonlyArray<{ sets: number }>,
  completedSets: readonly string[],
  currentIndex: number,
): number | null {
  const completed = new Set(completedSets);
  for (let offset = 1; offset <= exercises.length; offset++) {
    const index = (currentIndex + offset) % exercises.length;
    for (let set = 0; set < exercises[index].sets; set++) {
      if (!completed.has(`${index}-${set}`)) return index;
    }
  }
  return null;
}
