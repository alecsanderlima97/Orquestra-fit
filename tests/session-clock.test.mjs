import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionClock } from '../lib/workouts/session-clock.ts';

test('cronômetro mantém o tempo real mesmo quando o navegador atrasa os intervalos', () => {
  let now = 1000;
  const clock = createSessionClock(20, () => now);
  assert.equal(clock.getSeconds(), 20);
  now += 65000;
  assert.equal(clock.getSeconds(), 85);
  clock.stop();
  now += 12000;
  assert.equal(clock.getSeconds(), 85);
  clock.stop();
  assert.equal(clock.getSeconds(), 85);
});
