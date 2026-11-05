import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

let env;
const projectId = 'demo-orquestra-fit-audit';
const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
const path = (name) => `academies/a/${name}`;
const photoPath = path('assessment-photos/student/assessment/frente.jpg');
const jpeg = new Uint8Array([255, 216, 255, 217]);
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Execute com firebase emulators:exec e projeto demo.');
  env = await initializeTestEnvironment({ projectId,
    firestore: { host: '127.0.0.1', port: 8086, rules: await readFile('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 9197, rules: await readFile('storage.rules', 'utf8') },
  });
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    const fixtures = {
      'users/developer': { accountType: 'developer', activeAcademyId: 'a' },
      'users/manager': { accountType: 'academy_admin', activeAcademyId: 'a' },
      'users/teacher': { activeAcademyId: 'a' },
      'users/teacher2': { activeAcademyId: 'a' },
      'users/student': { activeAcademyId: 'a' },
      'academies/a': { ownerId: 'developer', monthlyAmount: 350, plan: 'Pró', aiCreditsBalance: 10 },
      'academies/b': { ownerId: 'other-manager' },
      [path('members/developer')]: { userId: 'developer', role: 'admin', active: true },
      [path('members/manager')]: { userId: 'manager', role: 'admin', active: true },
      [path('members/teacher')]: { userId: 'teacher', role: 'teacher', active: true },
      [path('members/teacher2')]: { userId: 'teacher2', role: 'teacher', active: true },
      [path('members/student')]: { userId: 'student', role: 'student', active: true },
      [path('members/blocked')]: { userId: 'blocked', role: 'student', active: true, accessBlocked: true },
      [path('members/inactive')]: { userId: 'inactive', role: 'student', active: false },
      'academies/b/members/other-manager': { role: 'admin', active: true },
      [path('students/student')]: { userId: 'student', teacherId: 'teacher', active: true, approvedRank: 'Bronze' },
      [path('students/second')]: { userId: 'second', teacherId: 'teacher2', active: true, approvedRank: 'Bronze' },
      [path('students/blocked')]: { userId: 'blocked', active: true, accessBlocked: true },
      [path('assessments/assessment')]: { studentId: 'student', weight: '72', photos: { frente: photoPath } },
      [path('workoutExecutions/history')]: { studentId: 'student' },
      [path('messages/private')]: { studentId: 'student', senderId: 'teacher', body: 'Mensagem privada' },
      [path('workouts/second-workout')]: { studentId: 'second', status: 'published', name: 'Treino B' },
      [path('plans/monthly')]: { name: 'Mensal', price: 120, active: true },
      [path('auditLogs/event')]: { type: 'test' },
      [path('exercises/exercise')]: { name: 'Exercício' },
      [path('stockItems/water')]: { name: 'Água', stock: 5 },
    };
    await Promise.all(Object.entries(fixtures).map(([p, data]) => setDoc(doc(admin, p), data)));
    await Promise.all([
      uploadBytes(ref(ctx.storage(), photoPath), jpeg, { contentType: 'image/jpeg' }),
      uploadBytes(ref(ctx.storage(), path('assessment-photos/second/assessment/frente.jpg')), jpeg, { contentType: 'image/jpeg' }),
    ]);
  });
});
after(async () => { if (env) await env.cleanup(); });

test('isola academias e impede aluno de consultar cadastro alheio', async () => {
  await assertSucceeds(getDoc(doc(db('manager'), path('students/student'))));
  await assertSucceeds(getDoc(doc(db('teacher'), path('students/student'))));
  await assertSucceeds(getDoc(doc(db('teacher'), path('students/second'))));
  await assertFails(getDoc(doc(db('student'), path('students/second'))));
  await assertFails(getDoc(doc(db('other-manager'), path('students/student'))));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path('students/student'))));
});
test('todos os professores consultam alunos e podem aprovar o próximo rank', async () => {
  await assertSucceeds(getDocs(collection(db('teacher'), path('students'))));
  await assertSucceeds(updateDoc(doc(db('teacher'), path('students/second')), { approvedRank: 'Prata', rankApprovedAt: serverTimestamp(), rankApprovedBy: 'teacher' }));
  await assertFails(updateDoc(doc(db('teacher'), path('students/second')), { active: false }));
  await assertFails(updateDoc(doc(db('teacher'), path('students/second')), { approvedRank: 'Diamante', rankApprovedAt: serverTimestamp(), rankApprovedBy: 'teacher' }));
});
test('aluno consulta suas avaliações, mas não altera nem lê as de outro', async () => {
  await assertSucceeds(getDoc(doc(db('student'), path('assessments/assessment'))));
  await assertFails(updateDoc(doc(db('student'), path('assessments/assessment')), { weight: '20' }));
  await assertFails(getDoc(doc(db('blocked'), path('assessments/assessment'))));
  await assertSucceeds(setDoc(doc(db('teacher'), path('assessments/new')), { studentId: 'student', weight: '73' }));
});
test('fotos privadas são visíveis ao aluno e equipe, sem acesso entre alunos ou empresas', async () => {
  for (const uid of ['student', 'teacher', 'manager']) {
    await assertSucceeds(getBytes(ref(env.authenticatedContext(uid).storage(), photoPath)));
  }
  for (const uid of ['blocked', 'inactive', 'other-manager']) {
    await assertFails(getBytes(ref(env.authenticatedContext(uid).storage(), photoPath)));
  }
  await assertSucceeds(getBytes(ref(env.authenticatedContext('teacher').storage(), path('assessment-photos/second/assessment/frente.jpg'))));
  await assertFails(getBytes(ref(env.authenticatedContext('student').storage(), path('assessment-photos/second/assessment/frente.jpg'))));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), photoPath)));
  await assertFails(uploadBytes(ref(env.authenticatedContext('student').storage(), path('assessment-photos/student/new/frente.jpg')), jpeg, { contentType: 'image/jpeg' }));
  await assertFails(deleteObject(ref(env.authenticatedContext('student').storage(), photoPath)));
});
test('professor vê e edita treino de aluno atribuído a outro professor; mensagens privadas seguem restritas', async () => {
  const workout = doc(db('teacher'), path('workouts/second-workout'));
  await assertSucceeds(getDoc(workout));
  await assertSucceeds(updateDoc(workout, { name: 'Treino revisado por outro professor' }));
  await assertFails(getDocs(query(collection(db('teacher2'), path('messages')), where('studentId', '==', 'student'))));
});
test('equipe pode enviar JPEG e remover foto; tipo incorreto e sobrescrita são recusados', async () => {
  const storage = env.authenticatedContext('teacher').storage();
  const target = ref(storage, path('assessment-photos/student/new/costas.jpg'));
  await assertSucceeds(uploadBytes(target, jpeg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(target, new Uint8Array([255, 216, 1, 2, 255, 217]), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storage, path('assessment-photos/student/new/document.html')), jpeg, { contentType: 'text/html' }));
  await assertSucceeds(deleteObject(target));
});
test('atualizações de perfil e presença preservam privilégios', async () => {
  await assertSucceeds(updateDoc(doc(db('teacher'), 'users/teacher'), { name: 'Professor Teste', phone: '11999999999', cpf: '', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db('student'), 'users/student'), { presenceStatus: 'present', presenceEnteredAt: serverTimestamp(), lastSeenAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db('student'), path('members/student')), { presenceStatus: 'left', presenceExitedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db('manager'), 'users/manager'), { accountType: 'developer' }));
  await assertFails(updateDoc(doc(db('student'), path('members/student')), { role: 'admin' }));
});
test('cadastro autônomo não pode conceder privilégio de desenvolvedor', async () => {
  const store = db('attacker');
  const batch = writeBatch(store);
  batch.set(doc(store, 'academies/fake'), { ownerId: 'attacker' });
  batch.set(doc(store, 'academies/fake/members/attacker'), { role: 'admin', active: true });
  batch.set(doc(store, 'users/attacker'), { activeAcademyId: 'fake', accountType: 'developer' });
  await assertFails(batch.commit());
});
test('configuração operacional não permite mudar licenciamento ou créditos', async () => {
  const target = doc(db('manager'), 'academies/a');
  await assertSucceeds(updateDoc(target, { phone: '11999999999', openingTime: '06:00', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(target, { monthlyAmount: 0, plan: 'free' }));
  await assertFails(updateDoc(target, { ownerId: 'manager' }));
  await assertFails(updateDoc(target, { aiCreditsBalance: 900 }));
  await assertSucceeds(updateDoc(doc(db('developer'), 'academies/a'), { monthlyAmount: 350 }));
});
test('históricos imutáveis não são liberados pela regra genérica; estoque continua funcionando', async () => {
  await assertFails(deleteDoc(doc(db('manager'), path('auditLogs/event'))));
  await assertFails(updateDoc(doc(db('manager'), path('workoutExecutions/history')), { studentId: 'second' }));
  await assertFails(deleteDoc(doc(db('manager'), path('plans/monthly'))));
  await assertSucceeds(updateDoc(doc(db('manager'), path('stockItems/water')), { stock: 6 }));
});
test('limite semanal aceita vazio ou 1 a 7, nunca negativo ou fracionário', async () => {
  const target = doc(db('manager'), path('plans/monthly'));
  for (const weeklyVisitLimit of [null, 1, 3, 7]) await assertSucceeds(updateDoc(target, { weeklyVisitLimit }));
  for (const weeklyVisitLimit of [-1, 0, 8, 2.5]) await assertFails(updateDoc(target, { weeklyVisitLimit }));
});
test('aluno bloqueado não consulta exercícios nem registra treino', async () => {
  await assertFails(getDoc(doc(db('blocked'), path('exercises/exercise'))));
  await assertFails(setDoc(doc(db('blocked'), path('workoutExecutions/blocked')), { studentId: 'blocked' }));
});

async function seedInvite(code, uid) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `accessCodes/${code}`), {
    academyId: 'a', role: 'student', active: true, invitedEmail: `${uid}@example.test`, plan: 'Mensal', planId: 'monthly', planPrice: 120, weeklyVisitLimit: 3,
  }));
}
function activation(code, uid, studentPatch = {}, userPatch = {}) {
  const store = db(uid); const batch = writeBatch(store);
  batch.update(doc(store, `accessCodes/${code}`), { active: false, claimedBy: uid, claimedAt: serverTimestamp() });
  batch.set(doc(store, path(`members/${uid}`)), { userId: uid, role: 'student', active: true, activationCodeId: code });
  batch.set(doc(store, path(`students/${uid}`)), { userId: uid, active: true, accessBlocked: false, activationCodeId: code, plan: 'Mensal', planId: 'monthly', planPrice: 120, weeklyVisitLimit: 3, ...studentPatch });
  batch.set(doc(store, `users/${uid}`), { activeAcademyId: 'a', activationCodeId: code, ...userPatch });
  return batch;
}
test('convite vinculado ao e-mail funciona uma vez e preserva plano e limite', async () => {
  await seedInvite('VALID', 'new-student');
  await assertSucceeds(activation('VALID', 'new-student').commit());
  await assertFails(activation('VALID', 'new-student').commit());
});
test('convite não permite alterar preço, limite ou privilégios', async () => {
  await seedInvite('TAMPER', 'invite-user');
  await assertFails(activation('TAMPER', 'invite-user', { planPrice: 0 }).commit());
  await assertFails(activation('TAMPER', 'invite-user', { weeklyVisitLimit: null }).commit());
  await assertFails(activation('TAMPER', 'invite-user', {}, { accountType: 'developer' }).commit());
  await assertFails(updateDoc(doc(db('student'), 'accessCodes/TAMPER'), { active: false, claimedBy: 'student' }));
});
