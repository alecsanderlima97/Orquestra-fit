import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const firestore = getFirestore();
const auth = getAuth();
const region = "southamerica-east1";

type PasswordPayload = { academyId?: unknown; newPassword?: unknown };
type ResetPayload = PasswordPayload & { targetUserId?: unknown };

function readString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `Informe ${field}.`);
  }
  return value.trim();
}

function validatePassword(value: unknown) {
  const password = readString(value, "uma senha");
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpsError("invalid-argument", "A senha precisa ter ao menos 10 caracteres, com letras e números.");
  }
  return password;
}

async function activeMembership(academyId: string, uid: string) {
  const membership = await firestore.doc(`academies/${academyId}/members/${uid}`).get();
  if (!membership.exists || membership.data()?.active !== true) {
    throw new HttpsError("permission-denied", "Acesso da academia não encontrado ou inativo.");
  }
  return membership;
}

async function setPasswordChangeRequired(uid: string, required: boolean) {
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  if (required) claims.passwordChangeRequired = true;
  else delete claims.passwordChangeRequired;
  await auth.setCustomUserClaims(uid, claims);
}

async function audit(academyId: string, actorId: string, type: string, targetUserId: string) {
  await firestore.collection(`academies/${academyId}/auditLogs`).add({
    type,
    actorId,
    targetUserId,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const resetMemberPassword = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre novamente para continuar.");
  const data = request.data as ResetPayload;
  const academyId = readString(data.academyId, "a academia");
  const targetUserId = readString(data.targetUserId, "o aluno");
  const temporaryPassword = validatePassword(data.newPassword);
  const actorMembership = await activeMembership(academyId, request.auth.uid);
  if (actorMembership.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Somente a gestão pode redefinir senhas.");
  }
  const targetMembership = await activeMembership(academyId, targetUserId);
  if (!["student", "teacher"].includes(targetMembership.data()?.role)) {
    throw new HttpsError("failed-precondition", "Esse perfil não pode receber senha temporária por esta tela.");
  }
  await auth.updateUser(targetUserId, { password: temporaryPassword });
  await setPasswordChangeRequired(targetUserId, true);
  await audit(academyId, request.auth.uid, "member_password_reset", targetUserId);
  return { ok: true };
});

export const changeOwnPassword = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre novamente para continuar.");
  if (request.auth.token.passwordChangeRequired !== true) {
    throw new HttpsError("failed-precondition", "Não há troca obrigatória de senha pendente.");
  }
  const data = request.data as PasswordPayload;
  const academyId = readString(data.academyId, "a academia");
  const newPassword = validatePassword(data.newPassword);
  await activeMembership(academyId, request.auth.uid);
  await auth.updateUser(request.auth.uid, { password: newPassword });
  await setPasswordChangeRequired(request.auth.uid, false);
  await audit(academyId, request.auth.uid, "own_password_changed", request.auth.uid);
  return { ok: true };
});
