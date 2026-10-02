import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from '../lib/search.ts';

test('busca nomes sem acento, sem diferenciar maiúsculas e por múltiplas palavras', () => {
  assert.equal(matchesSearch('JOAO silva', 'João da Silva'), true);
  assert.equal(matchesSearch('joao souza', 'João da Silva'), false);
  assert.equal(matchesSearch('  ', 'Qualquer registro'), true);
});

test('busca documentos e telefones com ou sem pontuação', () => {
  assert.equal(matchesSearch('12345678901', '123.456.789-01'), true);
  assert.equal(matchesSearch('(11) 99999-8888', '(11) 99999-8888'), true);
  assert.equal(matchesSearch('999998888', '(11) 99999-8888'), true);
});

test('busca valores e datas formatadas sem obrigar pontuação', () => {
  assert.equal(matchesSearch('150,00', 'R$ 150,00'), true);
  assert.equal(matchesSearch('28092026', '28/09/2026'), true);
  assert.equal(matchesSearch('undefined', undefined, null), false);
});
