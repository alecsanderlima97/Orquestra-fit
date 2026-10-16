import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPendingExercise } from '../lib/workouts/session-navigation.ts';

test('continua no próximo exercício que ainda tem séries pendentes', () => {
  assert.equal(nextPendingExercise([{ sets: 1 }, { sets: 2 }, { sets: 2 }], ['0-0', '1-0', '1-1', '2-0'], 0), 2);
});

test('retorna a uma pendência anterior quando os últimos exercícios já terminaram', () => {
  assert.equal(nextPendingExercise([{ sets: 2 }, { sets: 1 }, { sets: 1 }], ['0-0', '1-0', '2-0'], 2), 0);
});

test('direciona para conclusão quando não há exercícios pendentes', () => {
  assert.equal(nextPendingExercise([{ sets: 1 }], ['0-0'], 0), null);
  assert.equal(nextPendingExercise([], [], 0), null);
});
