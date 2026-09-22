import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp({ storageBucket: "orquestra-fit.firebasestorage.app" });

const firestore = getFirestore();
const auth = getAuth();
const region = "southamerica-east1";

type PasswordPayload = { academyId?: unknown; newPassword?: unknown };
type ResetPayload = PasswordPayload & { targetUserId?: unknown };
type ExerciseGifPayload = {
  academyId?: unknown;
  exerciseId?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  base64?: unknown;
  profile?: unknown;
};

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

async function canManageExerciseMedia(academyId: string, uid: string) {
  const [academySnapshot, membershipSnapshot] = await Promise.all([
    firestore.doc(`academies/${academyId}`).get(),
    firestore.doc(`academies/${academyId}/members/${uid}`).get(),
  ]);
  const isOwner = academySnapshot.data()?.ownerId === uid;
  const membership = membershipSnapshot.data();
  const isStaff = membershipSnapshot.exists && membership?.active === true && (membership.role === "admin" || membership.role === "teacher");
  if (!isOwner && !isStaff) {
    throw new HttpsError("permission-denied", "Somente a gestão ou um professor ativo pode enviar GIFs.");
  }
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

export const uploadExerciseGif = onCall({ region, timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre novamente para continuar.");
  const data = request.data as ExerciseGifPayload;
  const academyId = readString(data.academyId, "a academia");
  const exerciseId = readString(data.exerciseId, "o exercício");
  const fileName = readString(data.fileName, "o nome do GIF").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
  const contentType = readString(data.contentType, "o tipo do arquivo");
  const encoded = readString(data.base64, "o conteúdo do GIF").replace(/^data:image\/gif;base64,/, "");
  const profile = data.profile === "feminino" ? "feminino" : "masculino";
  if (contentType !== "image/gif") throw new HttpsError("invalid-argument", "O arquivo precisa ser um GIF.");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new HttpsError("invalid-argument", "O GIF precisa ter até 10 MB.");
  await canManageExerciseMedia(academyId, request.auth.uid);
  const exerciseRef = firestore.doc(`academies/${academyId}/exercises/${exerciseId}`);
  if (!(await exerciseRef.get()).exists) throw new HttpsError("not-found", "Exercício não encontrado.");

  const path = `academies/${academyId}/exercise-media/${exerciseId}/${Date.now()}-${randomUUID()}-${fileName}`;
  const bucket = getStorage().bucket();
  const file = bucket.file(path);
  const downloadToken = randomUUID();
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: "image/gif",
      cacheControl: "public,max-age=31536000,immutable",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
  const media = profile === "feminino"
    ? { gifFemaleUrl: url, gifFemalePath: path }
    : { gifUrl: url, gifPath: path, gifMaleUrl: url, gifMalePath: path };
  await exerciseRef.set(media, { merge: true });
  const workouts = await firestore.collection(`academies/${academyId}/workouts`).where("exerciseIds", "array-contains", exerciseId).get();
  await Promise.all(workouts.docs.map((workout) => {
    const details = workout.data().exerciseDetails;
    if (!Array.isArray(details)) return Promise.resolve();
    return workout.ref.update({
      exerciseDetails: details.map((detail: Record<string, unknown>) => detail.exerciseId === exerciseId ? { ...detail, ...media } : detail),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }));
  return { ok: true, path, url, ...media };
});
