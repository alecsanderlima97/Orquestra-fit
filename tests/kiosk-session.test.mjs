import test from 'node:test';
import assert from 'node:assert/strict';
import { kioskRemainingSeconds, KIOSK_IDLE_MS } from '../lib/kiosk-session.ts';

test('quiosque encerra após dois minutos reais mesmo se o navegador suspender o contador', () => {
  const activity = 1000;
  assert.equal(kioskRemainingSeconds(activity, activity), 120);
  assert.equal(kioskRemainingSeconds(activity, activity + 90_000), 30);
  assert.equal(kioskRemainingSeconds(activity, activity + KIOSK_IDLE_MS), 0);
  assert.equal(kioskRemainingSeconds(activity, activity + 600_000), 0);
});

test('atividade dentro do prazo renova a sessão do quiosque', () => {
  assert.equal(kioskRemainingSeconds(95_000, 100_000), 115);
});
