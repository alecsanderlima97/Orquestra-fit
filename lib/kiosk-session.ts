export const KIOSK_IDLE_MS = 120_000;
export const KIOSK_WARNING_MS = 30_000;

export function kioskRemainingSeconds(lastActivity: number, now: number) {
  return Math.max(0, Math.ceil((KIOSK_IDLE_MS - (now - lastActivity)) / 1000));
}
