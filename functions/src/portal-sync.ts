import type { Firestore, DocumentData } from "firebase-admin/firestore";

const SOURCE_SYSTEM = "orquestra_fit" as const;
const CONTRACT_VERSION = "v1" as const;
const DATA_VERSION = 1;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

type FirestoreValue = unknown;

function stringValue(value: FirestoreValue) {
  const text = String(value ?? "").trim();
  return text || null;
}

function timestampToMillis(value: FirestoreValue) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof (value as { toMillis?: unknown })?.toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (typeof (value as { toDate?: unknown })?.toDate === "function") return (value as { toDate: () => Date }).toDate().getTime();
  if (typeof (value as { seconds?: unknown })?.seconds === "number") return Number((value as { seconds: number }).seconds) * 1000;
  return undefined;
}

function isoValue(value: FirestoreValue) {
  const millis = timestampToMillis(value);
  if (millis !== undefined && Number.isFinite(millis)) return new Date(millis).toISOString();
  const text = stringValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
}

function dateValue(value: FirestoreValue) {
  return stringValue(value);
}

function documentType(value: FirestoreValue) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 14 ? "CNPJ" : digits.length > 0 ? "CPF" : null;
}

function isOnline(value: string | null, now: number) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Math.abs(now - timestamp) <= ONLINE_WINDOW_MS;
}

function externalCustomerId(academyId: string) {
  return "orquestra_fit_" + academyId;
}

function subscriptionStatus(data: DocumentData) {
  if (data.billingStatus === "suspended" || data.status === "suspended") return "suspenso";
  if (data.billingStatus === "past_due") return "em_atraso";
  return "ativo";
}

function addressValue(data: DocumentData) {
  const address = data.address && typeof data.address === "object" ? data.address as DocumentData : {};
  return {
    street: stringValue(address.street),
    number: stringValue(address.number),
    complement: stringValue(address.complement),
    neighborhood: stringValue(address.neighborhood),
    city: stringValue(address.city),
    state: stringValue(address.state),
    cep: stringValue(address.zip || address.cep),
    mapUrl: stringValue(data.mapUrl),
  };
}

export async function buildFitPortalSnapshot(firestore: Firestore) {
  const generatedAt = new Date().toISOString();
  const now = Date.now();
  const academySnapshot = await firestore.collection("academies").get();
  const academyDocs = academySnapshot.docs
    .filter((item) => {
      const data = item.data();
      const name = String(data.name ?? "");
      return data.accountType !== "developer" && data.environment !== "test" && data.demoData !== true && !/ambiente de testes|orquestra\.cs/i.test(name);
    })
    .sort((left, right) => String(left.data().name ?? "").localeCompare(String(right.data().name ?? ""), "pt-BR"));

  const clients = await Promise.all(academyDocs.map(async (academyDoc) => {
    const academy = academyDoc.data();
    const academyId = academyDoc.id;
    const externalId = externalCustomerId(academyId);
    const membersSnapshot = await firestore.collection("academies/" + academyId + "/members").get();
    const members = membersSnapshot.docs.map((memberDoc) => {
      const data = memberDoc.data() as DocumentData;
      return { ...data, id: memberDoc.id } as DocumentData & { id: string };
    });
    const users = members.map((member) => {
      const lastActivityAt = isoValue(member.lastActivityAt || member.lastSeenAt);
      return {
        id: member.id,
        name: stringValue(member.displayName || member.name || member.email),
        email: stringValue(member.email),
        role: stringValue(member.role),
        isOwner: member.id === stringValue(academy.ownerId),
        userType: member.role === "student" ? "end_user" : "admin",
        lastActivityAt,
        lastAccessAt: isoValue(member.lastAccessAt),
        device: stringValue(member.lastDevice),
      };
    });
    const owner = users.find((user) => user.isOwner) || users.find((user) => user.userType === "admin") || null;
    const lastActivityAt = isoValue(academy.lastActivityAt || academy.lastSeenAt) || users.map((user) => user.lastActivityAt).filter(Boolean).sort().at(-1) || null;
    const aiCredits = academy.aiCredits && typeof academy.aiCredits === "object" ? academy.aiCredits as DocumentData : {};
    const monthlyCredits = Math.max(0, Number(academy.aiCreditsMonthly ?? academy.aiCreditsTotal ?? aiCredits.included ?? 0));
    const extraCredits = Math.max(0, Number(academy.aiCreditsExtras ?? aiCredits.bonus ?? 0));
    const balanceCredits = Math.max(0, Number(academy.aiCreditsBalance ?? aiCredits.balance ?? monthlyCredits + extraCredits));
    const planId = "premium" as const;
    const status = subscriptionStatus(academy);
    const monthlyAmount = Number(academy.monthlyAmount);
    const graceDaysValue = Number(academy.billingToleranceDays);
    const graceDays = Number.isInteger(graceDaysValue) && graceDaysValue >= 0 && graceDaysValue <= 30 ? graceDaysValue : 3;

    return {
      id: externalId,
      externalCustomerId: externalId,
      dataVersion: DATA_VERSION,
      client: {
        id: externalId,
        externalCustomerId: externalId,
        name: stringValue(academy.name) || "Academia",
        legalName: stringValue(academy.legalName),
        tradeName: stringValue(academy.tradeName || academy.name),
        email: stringValue(academy.commercialEmail || academy.ownerEmail),
        phone: stringValue(academy.contactPhone),
        document: { type: documentType(academy.taxId), number: stringValue(academy.taxId) },
        address: addressValue(academy),
        aiCredits: { balance: balanceCredits, bonus: extraCredits, included: monthlyCredits, used: Math.max(0, Number(aiCredits.used ?? academy.aiCreditsUsed ?? 0)) },
      },
      responsible: {
        name: owner?.name || stringValue(academy.ownerEmail),
        email: owner?.email || stringValue(academy.ownerEmail),
        phone: stringValue(academy.contactPhone),
      },
      owner,
      subscription: {
        planId,
        planName: stringValue(academy.plan) || "Pró",
        monthlyFee: Number.isFinite(monthlyAmount) && monthlyAmount >= 0 ? monthlyAmount : null,
        billingDay: dateValue(academy.billingDueDate),
        renewalDate: dateValue(academy.billingDueDate),
        startDate: dateValue(academy.startDate || academy.createdAt),
        graceDays,
        paymentMethod: stringValue(academy.paymentMethod),
        billingStatus: stringValue(academy.billingStatus || academy.status),
        subscriptionStatus: status,
        paidPeriod: null,
      },
      users,
      onlineUserCount: users.filter((user) => isOnline(user.lastActivityAt, now)).length,
      lastActivityAt,
      updatedAt: isoValue(academy.updatedAt || academy.createdAt) || generatedAt,
    };
  }));

  const payload = { contractVersion: CONTRACT_VERSION, dataVersion: DATA_VERSION, sourceSystem: SOURCE_SYSTEM, generatedAt, updatedAt: generatedAt, clients };
  const serializedPayload = JSON.stringify(payload);
  return {
    payload,
    serializedPayload,
    summary: {
      clientCount: clients.length,
      contractVersion: CONTRACT_VERSION,
      dataVersion: DATA_VERSION,
      generatedAt,
      onlineUserCount: clients.reduce((total, client) => total + client.onlineUserCount, 0),
      payloadBytes: Buffer.byteLength(serializedPayload, "utf8"),
      updatedAt: generatedAt,
      userCount: clients.reduce((total, client) => total + client.users.length, 0),
    },
    academyIds: academyDocs.map((academy) => academy.id),
  };
}

