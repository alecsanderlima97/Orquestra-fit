import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
let api, db;
const academyId = 'reservations-audit';
const call = (uid, classId = 'class', token = {}) => ({ data: { academyId, classId }, auth: { uid, token: { name: uid, ...token } } });
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Somente emulador');
  process.env.GCLOUD_PROJECT = 'demo-orquestra-fit-audit';
  api = await import('../../functions/lib/index.js');
  db = require('firebase-admin/firestore').getFirestore();
  for (const uid of ['first', 'second', 'blocked', 'other']) {
    await db.doc(`academies/${academyId}/members/${uid}`).set({ role: 'student', active: true });
    await db.doc(`academies/${academyId}/students/${uid}`).set({ userId: uid, active: true, accessBlocked: uid === 'blocked' });
  }
  await db.doc(`academies/${academyId}/classes/class`).set({ name: 'Teste', active: true, capacity: 1, reservedCount: 0, visibility: 'all' });
});
after(async () => { await require('firebase-admin/app').deleteApp(require('firebase-admin/app').getApp()); });
test('reserva exige autenticação, matrícula e acesso liberado no servidor', async () => {
  await assert.rejects(api.reserveClass.run({ data: { academyId, classId: 'class' } }), { code: 'unauthenticated' });
  await assert.rejects(api.reserveClass.run(call('unknown')), { code: 'permission-denied' });
  await assert.rejects(api.reserveClass.run(call('blocked')), { code: 'permission-denied' });
  await assert.rejects(api.reserveClass.run(call('first', 'class', { passwordChangeRequired: true })), { code: 'permission-denied' });
});
test('duas reservas concorrentes não excedem lotação', async () => {
  const results = await Promise.allSettled([api.reserveClass.run(call('first')), api.reserveClass.run(call('second'))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'resource-exhausted').length, 1);
  const reservations = await db.collection(`academies/${academyId}/reservations`).where('status', '==', 'active').get();
  assert.equal(reservations.size, 1);
  const studentId = reservations.docs[0].data().studentId;
  assert.equal((await api.reserveClass.run(call(studentId))).alreadyReserved, true);
});
test('lista de espera recusa bloqueados e cancelamento promove somente aluno liberado', async () => {
  await assert.rejects(api.joinClassWaitlist.run(call('blocked')), { code: 'permission-denied' });
  const reservations = await db.collection(`academies/${academyId}/reservations`).where('status', '==', 'active').get();
  const reservedId = reservations.docs[0].data().studentId;
  const waitingId = reservedId === 'first' ? 'second' : 'first';
  await db.doc(`academies/${academyId}/classWaitlist/blocked-old`).set({ classId: 'class', studentId: 'blocked', status: 'active', joinedAt: new Date(0) });
  await api.joinClassWaitlist.run(call(waitingId));
  const result = await api.cancelClassReservation.run(call(reservedId));
  assert.equal(result.canceled, true);
  const next = await db.collection(`academies/${academyId}/reservations`).where('status', '==', 'active').get();
  assert.equal(next.size, 1);
  assert.equal(next.docs[0].data().studentId, waitingId);
  assert.equal((await db.doc(`academies/${academyId}/classes/class`).get()).data().reservedCount, 1);
});
