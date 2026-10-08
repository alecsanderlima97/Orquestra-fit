export function createSessionClock(initialSeconds = 0, now = Date.now) {
  const startedAt = now();
  let stoppedAt: number | null = null;
  return {
    getSeconds: () => Math.max(0, initialSeconds + Math.floor(((stoppedAt ?? now()) - startedAt) / 1000)),
    stop: () => { stoppedAt ??= now(); },
  };
}

export type SessionClock = ReturnType<typeof createSessionClock>;
