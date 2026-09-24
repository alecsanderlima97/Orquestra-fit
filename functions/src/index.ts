import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { CollectionReference, FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

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
type ClassReservationPayload = { academyId?: unknown; classId?: unknown };

type ClassWaitlistRecord = { id: string; classId: string; className?: string; studentId: string; studentName?: string; status: "active" | "canceled" | "promoted"; position?: number; joinedAt?: unknown };

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

function isoDate(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

function dateFromIso(value: unknown) {
  const normalized = isoDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addBillingMonths(date: Date, months: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(date.getDate(), lastDay));
  return next;
}

function billingIntervalMonths(value: unknown) {
  const label = String(value ?? "Mensal").toLocaleLowerCase("pt-BR");
  if (label.includes("anual") || label.includes("ano")) return 12;
  if (label.includes("semestral") || label.includes("semestre")) return 6;
  if (label.includes("trimestral") || label.includes("trimestre")) return 3;
  return 1;
}

function recurringChargeId(studentId: string, planId: string, dueDate: string) {
  return `recurring-${studentId}-${planId}-${dueDate}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 140);
}

/**
 * Gera mensalidades de planos ativos e marca o acesso financeiro do aluno.
 * A catraca ainda não é acionada por esta rotina; o campo accessBlocked fica
 * pronto para a futura integração física.
 */
export const generateRecurringCharges = onSchedule({ schedule: "15 3 * * *", timeZone: "America/Sao_Paulo", region }, async () => {
  const today = todayInSaoPaulo();
  const academySnapshot = await firestore.collection("academies").get();
  let created = 0;
  let blocked = 0;

  for (const academy of academySnapshot.docs) {
    const academyId = academy.id;
    const [studentsSnapshot, plansSnapshot, chargesSnapshot] = await Promise.all([
      firestore.collection(`academies/${academyId}/students`).get(),
      firestore.collection(`academies/${academyId}/plans`).get(),
      firestore.collection(`academies/${academyId}/monthlyCharges`).get(),
    ]);
    const plans = new Map(plansSnapshot.docs.filter((item) => item.data().active !== false).map((item) => [item.id, item.data()]));
    const chargesByStudent = new Map<string, Array<{ dueDate?: unknown; status?: unknown; chargeType?: unknown; planId?: unknown }>>();
    chargesSnapshot.docs.forEach((item) => {
      const data = item.data();
      const studentId = typeof data.studentId === "string" ? data.studentId : "";
      if (!studentId) return;
      chargesByStudent.set(studentId, [...(chargesByStudent.get(studentId) ?? []), data]);
    });
    let batch = firestore.batch();
    let writes = 0;
    const flush = async () => {
      if (!writes) return;
      await batch.commit();
      batch = firestore.batch();
      writes = 0;
    };

    for (const studentSnapshot of studentsSnapshot.docs.filter((item) => item.data().active !== false)) {
      const student = studentSnapshot.data();
      const planId = typeof student.planId === "string" ? student.planId : "";
      const plan = planId ? plans.get(planId) : undefined;
      const price = Number(plan?.price ?? student.planPrice ?? 0);
      if (!plan || !price || price <= 0) continue;
      const studentCharges = chargesByStudent.get(studentSnapshot.id) ?? [];
      const firstDate = dateFromIso(student.nextBillingDate) ?? dateFromIso(student.initialDueDate) ?? dateFromIso(student.planStartedAt) ?? dateFromIso(student.joinedAt) ?? new Date();
      let cursor = firstDate;
      let iterations = 0;
      while (isoDate(cursor)! <= today && iterations < 24) {
        const dueDate = isoDate(cursor)!;
        const existing = studentCharges.some((charge) => isoDate(charge.dueDate) === dueDate && charge.chargeType === "monthly" && charge.planId === planId);
        if (!existing) {
          batch.create(firestore.doc(`academies/${academyId}/monthlyCharges/${recurringChargeId(studentSnapshot.id, planId, dueDate)}`), {
            studentId: studentSnapshot.id,
            studentName: String(student.name ?? "Aluno"),
            planId,
            planName: String(plan.name ?? student.plan ?? "Mensalidade"),
            amount: price,
            dueDate,
            status: "pending",
            chargeType: "monthly",
            origin: "recurring_scheduler",
            createdAt: FieldValue.serverTimestamp(),
          });
          writes += 1;
          created += 1;
        }
        cursor = addBillingMonths(cursor, billingIntervalMonths(plan.interval));
        iterations += 1;
        if (writes >= 450) await flush();
      }
      const overdue = studentCharges.some((charge) => charge.status !== "paid" && (isoDate(charge.dueDate) ?? "9999-12-31") <= today);
      if (overdue) blocked += 1;
      const nextBillingDate = isoDate(cursor);
      batch.set(studentSnapshot.ref, { nextBillingDate, accessBlocked: overdue, accessBlockReason: overdue ? "cobranca_em_atraso" : null, accessStatusUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writes += 1;
      const userId = typeof student.userId === "string" ? student.userId : "";
      if (userId) {
        batch.set(firestore.doc(`academies/${academyId}/members/${userId}`), { accessBlocked: overdue, accessBlockReason: overdue ? "cobranca_em_atraso" : null, accessStatusUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
        writes += 1;
      }
      if (writes >= 450) await flush();
    }
    await flush();
  }
  console.info("Cobrança recorrente concluída", { today, created, blocked });
});

function backupValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { __type: "bytes", value: value.toString("base64") };
  if (Array.isArray(value)) return value.map(backupValue);
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") return { __type: "timestamp", value: (value as { toDate: () => Date }).toDate().toISOString() };
  if (typeof value === "object" && "path" in value && typeof (value as { path?: unknown }).path === "string") return { __type: "reference", path: (value as { path: string }).path };
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, backupValue(item)]));
}

async function exportBackupCollection(collectionRef: CollectionReference, output: Array<Record<string, unknown>>) {
  const snapshot = await collectionRef.get();
  for (const item of snapshot.docs) {
    const node: Record<string, unknown> = { path: item.ref.path, data: backupValue(item.data()) };
    const nested = await item.ref.listCollections();
    if (nested.length) {
      const children: Array<Record<string, unknown>> = [];
      for (const child of nested) await exportBackupCollection(child, children);
      node.subcollections = children;
    }
    output.push(node);
  }
}

/** Backup JSON privado diário no Storage do projeto. Mantém uma cópia recuperável sem expor dados no frontend. */
export const backupFirestoreProduction = onSchedule({ schedule: "45 3 * * *", timeZone: "America/Sao_Paulo", region }, async () => {
  const collections = await firestore.listCollections();
  const output: Array<Record<string, unknown>> = [];
  for (const collectionRef of collections) await exportBackupCollection(collectionRef, output);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = getStorage().bucket().file(`firestore-backups/${stamp}.json`);
  await file.save(JSON.stringify({ exportedAt: new Date().toISOString(), project: "orquestra-fit", collections: output }), { resumable: false, contentType: "application/json", metadata: { cacheControl: "private, no-store" } });
  console.info("Backup do Firestore salvo", { path: file.name, collections: output.length });
});

function whatsappPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/** Processa lembretes agendados quando as credenciais oficiais do WhatsApp Business estiverem configuradas. */
export const processScheduledWhatsApp = onSchedule({ schedule: "every 5 minutes", timeZone: "America/Sao_Paulo", region }, async () => {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const academies = await firestore.collection("academies").get();
  let processed = 0;
  for (const academy of academies.docs) {
    const messages = await firestore.collection(`academies/${academy.id}/scheduledMessages`).get();
    for (const message of messages.docs) {
      const data = message.data();
      if (data.status !== "pending") continue;
      const scheduledAt = data.scheduledAt && typeof data.scheduledAt === "object" && "toDate" in data.scheduledAt && typeof (data.scheduledAt as { toDate?: unknown }).toDate === "function"
        ? (data.scheduledAt as { toDate: () => Date }).toDate().getTime()
        : new Date(String(data.scheduledAt ?? "")).getTime();
      if (!Number.isFinite(scheduledAt) || scheduledAt > Date.now()) continue;
      if (!token || !phoneNumberId) {
        await message.ref.update({ status: "awaiting_provider", error: "Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID para envio automático.", attemptedAt: FieldValue.serverTimestamp() });
        continue;
      }
      const to = whatsappPhone(data.phone);
      if (!to || typeof data.body !== "string" || !data.body.trim()) {
        await message.ref.update({ status: "error", error: "Telefone ou mensagem inválidos.", attemptedAt: FieldValue.serverTimestamp() });
        continue;
      }
      try {
        const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: data.body } }),
        });
        if (!response.ok) throw new Error(`WhatsApp API ${response.status}`);
        await message.ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp(), attemptedAt: FieldValue.serverTimestamp() });
        processed += 1;
      } catch (error) {
        await message.ref.update({ status: "error", error: error instanceof Error ? error.message : "Falha no provedor WhatsApp.", attemptedAt: FieldValue.serverTimestamp() });
      }
    }
  }
  console.info("Mensagens WhatsApp processadas", { processed });
});

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

export const reserveClass = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre novamente para reservar uma aula.");
  const data = request.data as ClassReservationPayload;
  const academyId = readString(data.academyId, "a academia");
  const classId = readString(data.classId, "a aula");
  const uid = request.auth.uid;
  const studentName = request.auth.token.name ?? request.auth.token.email ?? "Aluno";
  const membership = await activeMembership(academyId, uid);
  if (membership.data()?.role !== "student") throw new HttpsError("permission-denied", "Somente alunos podem reservar aulas.");
  const [studentByUid, studentByRecord] = await Promise.all([
    firestore.collection(`academies/${academyId}/students`).where("userId", "==", uid).limit(1).get(),
    firestore.doc(`academies/${academyId}/students/${uid}`).get(),
  ]);
  const studentIds = new Set([uid, studentByUid.docs[0]?.id, studentByRecord.exists ? studentByRecord.id : undefined].filter((item): item is string => Boolean(item)));

  const classRef = firestore.doc(`academies/${academyId}/classes/${classId}`);
  const reservationCollection = firestore.collection(`academies/${academyId}/reservations`);
  const reservationQuery = reservationCollection.where("classId", "==", classId).where("status", "==", "active");
  let alreadyReserved = false;
  let reservedCount = 0;

  await firestore.runTransaction(async (transaction) => {
    const classSnapshot = await transaction.get(classRef);
    if (!classSnapshot.exists) throw new HttpsError("not-found", "A aula não foi encontrada.");
    const classData = classSnapshot.data() ?? {};
    if (classData.active === false) throw new HttpsError("failed-precondition", "Essa aula está inativa.");
    if (classData.visibility === "selected" && !Array.isArray(classData.selectedStudentIds)) throw new HttpsError("failed-precondition", "Essa aula ainda não está disponível para seleção.");
    if (classData.visibility === "selected" && !(classData.selectedStudentIds as unknown[]).some((item) => typeof item === "string" && studentIds.has(item))) throw new HttpsError("permission-denied", "Essa aula é restrita aos alunos selecionados.");

    const reservationsSnapshot = await transaction.get(reservationQuery);
    const activeReservations = reservationsSnapshot.docs;
    alreadyReserved = activeReservations.some((item) => item.data().studentId === uid);
    reservedCount = activeReservations.length;
    if (alreadyReserved) return;
    const capacity = Math.max(1, Number(classData.capacity ?? 10));
    if (reservedCount >= capacity) throw new HttpsError("resource-exhausted", "Essa aula está lotada.");

    const reservationRef = reservationCollection.doc();
    transaction.create(reservationRef, {
      classId,
      className: String(classData.name ?? "Aula"),
      studentId: uid,
      studentName,
      status: "active",
      source: "student",
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(classRef, { reservedCount: reservedCount + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    reservedCount += 1;
  });

  return { ok: true, alreadyReserved, reservedCount };
});

export const cancelClassReservation = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre novamente para cancelar a reserva.");
  const data = request.data as ClassReservationPayload;
  const academyId = readString(data.academyId, "a academia");
  const classId = readString(data.classId, "a aula");
  const uid = request.auth.uid;
  const membership = await activeMembership(academyId, uid);
  if (membership.data()?.role !== "student") throw new HttpsError("permission-denied", "Somente alunos podem cancelar suas reservas.");

  const classRef = firestore.doc(`academies/${academyId}/classes/${classId}`);
  const reservationCollection = firestore.collection(`academies/${academyId}/reservations`);
  const reservationQuery = reservationCollection.where("classId", "==", classId).where("studentId", "==", uid).where("status", "==", "active");
  const waitlistQuery = firestore.collection(`academies/${academyId}/classWaitlist`).where("classId", "==", classId).where("status", "==", "active");
  let canceled = false;
  await firestore.runTransaction(async (transaction) => {
    const [classSnapshot, reservationSnapshot, waitlistSnapshot] = await Promise.all([transaction.get(classRef), transaction.get(reservationQuery), transaction.get(waitlistQuery)]);
    if (!classSnapshot.exists) throw new HttpsError("not-found", "A aula não foi encontrada.");
    const reservation = reservationSnapshot.docs[0];
    if (!reservation) return;
    transaction.update(reservation.ref, { status: "canceled", canceledAt: FieldValue.serverTimestamp(), canceledBy: uid });
    const currentCount = Math.max(0, Number(classSnapshot.data()?.reservedCount ?? 1));
    const nextWaitlist = waitlistSnapshot.docs
      .map((item) => ({ ref: item.ref, data: item.data() as ClassWaitlistRecord }))
      .sort((a, b) => {
        const aTime = typeof a.data.joinedAt === "object" && a.data.joinedAt && "toMillis" in a.data.joinedAt ? (a.data.joinedAt as { toMillis: () => number }).toMillis() : Number.MAX_SAFE_INTEGER;
        const bTime = typeof b.data.joinedAt === "object" && b.data.joinedAt && "toMillis" in b.data.joinedAt ? (b.data.joinedAt as { toMillis: () => number }).toMillis() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })[0];
    if (nextWaitlist) {
      const promotedReservation = reservationCollection.doc();
      transaction.create(promotedReservation, {
        classId,
        className: String(classSnapshot.data()?.name ?? "Aula"),
        studentId: nextWaitlist.data.studentId,
        studentName: nextWaitlist.data.studentName ?? "Aluno",
        status: "active",
        source: "waitlist",
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(nextWaitlist.ref, { status: "promoted", promotedAt: FieldValue.serverTimestamp() });
      transaction.set(classRef, { reservedCount: currentCount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      transaction.set(classRef, { reservedCount: Math.max(0, currentCount - 1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    canceled = true;
  });
  return { ok: true, canceled };
});

export const joinClassWaitlist = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre novamente para entrar na lista de espera.");
  const data = request.data as ClassReservationPayload;
  const academyId = readString(data.academyId, "a academia");
  const classId = readString(data.classId, "a aula");
  const uid = request.auth.uid;
  const studentName = request.auth.token.name ?? request.auth.token.email ?? "Aluno";
  const membership = await activeMembership(academyId, uid);
  if (membership.data()?.role !== "student") throw new HttpsError("permission-denied", "Somente alunos podem entrar na lista de espera.");

  const classRef = firestore.doc(`academies/${academyId}/classes/${classId}`);
  const reservationQuery = firestore.collection(`academies/${academyId}/reservations`).where("classId", "==", classId).where("status", "==", "active");
  const waitlistCollection = firestore.collection(`academies/${academyId}/classWaitlist`);
  const waitlistQuery = waitlistCollection.where("classId", "==", classId).where("status", "==", "active");
  let position = 0;
  let alreadyWaiting = false;
  await firestore.runTransaction(async (transaction) => {
    const [classSnapshot, reservationSnapshot, waitlistSnapshot] = await Promise.all([transaction.get(classRef), transaction.get(reservationQuery), transaction.get(waitlistQuery)]);
    if (!classSnapshot.exists) throw new HttpsError("not-found", "A aula não foi encontrada.");
    const classData = classSnapshot.data() ?? {};
    if (classData.active === false) throw new HttpsError("failed-precondition", "Essa aula está inativa.");
    if (classData.visibility === "selected") throw new HttpsError("permission-denied", "A lista de espera está disponível apenas para aulas abertas.");
    if (reservationSnapshot.docs.some((item) => item.data().studentId === uid)) throw new HttpsError("already-exists", "Você já está reservado nesta aula.");
    alreadyWaiting = waitlistSnapshot.docs.some((item) => item.data().studentId === uid);
    if (alreadyWaiting) {
      position = waitlistSnapshot.size;
      return;
    }
    const capacity = Math.max(1, Number(classData.capacity ?? 10));
    if (reservationSnapshot.size < capacity) throw new HttpsError("failed-precondition", "Ainda há vaga. Faça a reserva diretamente.");
    position = waitlistSnapshot.size + 1;
    const waitlistRef = waitlistCollection.doc();
    transaction.create(waitlistRef, { classId, className: String(classData.name ?? "Aula"), studentId: uid, studentName, status: "active", position, joinedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true, alreadyWaiting, position };
});

export const leaveClassWaitlist = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Entre novamente para sair da lista de espera.");
  const data = request.data as ClassReservationPayload;
  const academyId = readString(data.academyId, "a academia");
  const classId = readString(data.classId, "a aula");
  const uid = request.auth.uid;
  const membership = await activeMembership(academyId, uid);
  if (membership.data()?.role !== "student") throw new HttpsError("permission-denied", "Somente alunos podem sair da lista de espera.");
  const waitlistQuery = firestore.collection(`academies/${academyId}/classWaitlist`).where("classId", "==", classId).where("studentId", "==", uid).where("status", "==", "active");
  const snapshot = await waitlistQuery.get();
  if (!snapshot.empty) await snapshot.docs[0].ref.update({ status: "canceled", canceledAt: FieldValue.serverTimestamp() });
  return { ok: true, removed: !snapshot.empty };
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
