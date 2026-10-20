"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import {
  Bell, Building2, ChevronDown, ChevronRight, CircleDollarSign, CloudCog, FileText, LockKeyhole,
  PauseCircle, Pencil, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, X,
} from "lucide-react";
import { useAccess } from "@/components/auth/access-context";
import { db, functions } from "@/lib/firebase/client";

type CentralAdminPanelProps = {
  onFeedback: (message: string) => void;
  onClose?: () => void;
  fullScreen?: boolean;
};

type AcademyRecord = {
  id: string;
  name: string;
  ownerEmail?: string | null;
  plan?: string | null;
  status?: string | null;
  billingStatus?: string | null;
  billingDueDate?: string | null;
  monthlyAmount?: number | null;
  createdAt?: unknown;
  contactPhone?: string | null;
  commercialEmail?: string | null;
  taxId?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  address?: Record<string, string> | null;
  aiCredits?: number | AiCreditsRecord | null;
  aiCreditsBalance?: number | null;
  aiCreditsTotal?: number | null;
  aiCreditsMonthly?: number | null;
  aiCreditsExtras?: number | null;
};

type AiCreditsRecord = {
  balance?: number;
  bonus?: number;
  included?: number;
  renewalMonth?: string;
  status?: string;
  used?: number;
  lastAdjustmentAt?: unknown;
  lastAdjustmentBy?: string | null;
};

type AcademyMember = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean;
  lastAccessAt?: unknown;
  lastSeenAt?: unknown;
  presenceStatus?: string | null;
};

type AcademyForm = {
  name: string;
  ownerEmail: string;
  plan: string;
  status: "active" | "past_due" | "suspended";
  monthlyAmount: string;
  billingDueDate: string;
  billingToleranceDays: string;
  contactPhone: string;
  commercialEmail: string;
  taxId: string;
  legalName: string;
  tradeName: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  paymentMethod: string;
  startDate: string;
  notes: string;
};

type CentralAdminColumnKey = "client" | "plan" | "status" | "signup" | "due" | "calculated" | "lastAccess" | "online" | "credits" | "action";

const ORQUESTRA_PLAN_NAME = "Pró";
const ORQUESTRA_PLAN_PRICE = 350;

const centralAdminColumns: Array<{ key: CentralAdminColumnKey; label: string }> = [
  { key: "client", label: "Cliente" }, { key: "plan", label: "Plano" }, { key: "status", label: "Status" },
  { key: "signup", label: "Inscrição" }, { key: "due", label: "Vencimento" }, { key: "calculated", label: "Situação calculada" },
  { key: "lastAccess", label: "Último acesso" }, { key: "online", label: "Online" }, { key: "credits", label: "Créditos IA" },
  { key: "action", label: "Ação" },
];

const navigation = [["Admin Orquestra", ShieldCheck]] as const;

function firestoreDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function dateLabel(value: unknown) {
  const date = firestoreDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "Sem registro";
}

function dateTimeLabel(value: unknown) {
  const date = firestoreDate(value);
  return date ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem registro";
}

function statusLabel(value?: string | null) {
  if (value === "past_due") return "Em atraso";
  if (value === "suspended" || value === "archived") return "Suspensa";
  return "Ativo";
}

function statusTone(value?: string | null) {
  return value === "past_due" || value === "suspended" || value === "archived" ? "warning" : "active";
}

function daysToDue(value?: string | null) {
  if (!value) return null;
  const due = new Date(`${value}T12:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - Date.now()) / 86_400_000);
}

function calculatedStatus(academy: AcademyRecord) {
  if (academy.billingStatus === "past_due") return { label: "Em atraso", tone: "warning" };
  if (academy.billingStatus === "suspended") return { label: "Suspensa", tone: "danger" };
  const days = daysToDue(academy.billingDueDate);
  if (days === null) return { label: "Sem vencimento", tone: "neutral" };
  if (days < 0) return { label: `Vencida há ${Math.abs(days)} dia(s)`, tone: "danger" };
  return { label: `Em dia: vence em ${days} dia(s)`, tone: "active" };
}

function emptyForm(): AcademyForm {
  return {
    name: "", ownerEmail: "", plan: ORQUESTRA_PLAN_NAME, status: "active", monthlyAmount: ORQUESTRA_PLAN_PRICE.toFixed(2).replace(".", ","), billingDueDate: "",
    billingToleranceDays: "5", contactPhone: "", commercialEmail: "", taxId: "", legalName: "", tradeName: "",
    zip: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", paymentMethod: "Pix",
    startDate: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()), notes: "",
  };
}

function academyToForm(academy: AcademyRecord): AcademyForm {
  const address = academy.address ?? {};
  return {
    ...emptyForm(), name: academy.name, ownerEmail: academy.ownerEmail ?? "", plan: ORQUESTRA_PLAN_NAME,
    status: academy.billingStatus === "past_due" || academy.billingStatus === "suspended" ? academy.billingStatus : "active",
    monthlyAmount: ORQUESTRA_PLAN_PRICE.toFixed(2).replace(".", ","), billingDueDate: academy.billingDueDate ?? "",
    contactPhone: academy.contactPhone ?? "", commercialEmail: academy.commercialEmail ?? "", taxId: academy.taxId ?? "",
    legalName: academy.legalName ?? "", tradeName: academy.tradeName ?? "", zip: address.zip ?? "", street: address.street ?? "",
    number: address.number ?? "", complement: address.complement ?? "", neighborhood: address.neighborhood ?? "", city: address.city ?? "",
    state: address.state ?? "", notes: "",
  };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AC";
}

function academyCredits(academy: AcademyRecord) {
  const ledger = academy.aiCredits && typeof academy.aiCredits === "object" ? academy.aiCredits : null;
  const monthly = Math.max(0, Number(academy.aiCreditsMonthly ?? academy.aiCreditsTotal ?? ledger?.included ?? (typeof academy.aiCredits === "number" ? academy.aiCredits : 0)));
  const extras = Math.max(0, Number(academy.aiCreditsExtras ?? ledger?.bonus ?? 0));
  const total = Math.max(monthly + extras, Number(academy.aiCreditsTotal ?? 0));
  const balance = Math.max(0, Number(academy.aiCreditsBalance ?? ledger?.balance ?? total));
  return { balance, monthly, extras, total };
}

type CreditModalState = { academy: AcademyRecord; amount: string; reason: string };

function AiCreditsModal({ state, onClose, onChange, onSubmit, saving }: { state: CreditModalState; onClose: () => void; onChange: (field: "amount" | "reason", value: string) => void; onSubmit: () => void; saving: boolean }) {
  const credits = academyCredits(state.academy);
  return <div className="central-admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="central-admin-credits-title"><section className="central-admin-credits-modal"><header><div><span>CRÉDITOS IA</span><h2 id="central-admin-credits-title">Adicionar créditos extras</h2><p>{state.academy.name}</p></div><button type="button" onClick={onClose} aria-label="Fechar créditos IA"><X size={17} /></button></header><div className="central-admin-credits-body"><div className="central-admin-credits-balance"><span>Saldo atual: <strong>{credits.balance} crédito(s)</strong></span><small>Mensais: {credits.monthly} · Extras acumulados: {credits.extras}</small></div><label>Quantidade de créditos<input type="number" min="1" max="100000" step="1" value={state.amount} onChange={(event) => onChange("amount", event.target.value)} /></label><label>Motivo obrigatório<textarea value={state.reason} maxLength={300} onChange={(event) => onChange("reason", event.target.value)} placeholder="Ex.: compra do pacote de 300 créditos" /></label></div><footer><button type="button" className="central-admin-secondary" onClick={onClose}>Cancelar</button><button type="button" className="central-admin-credit-submit" onClick={onSubmit} disabled={saving}><Sparkles size={14} />{saving ? "Adicionando…" : "Adicionar créditos"}</button></footer></section></div>;
}

export function CentralAdminPanel({ onFeedback, onClose, fullScreen = true }: CentralAdminPanelProps) {
  const access = useAccess();
  const [academies, setAcademies] = useState<AcademyRecord[]>([]);
  const [membersByAcademy, setMembersByAcademy] = useState<Record<string, AcademyMember[]>>({});
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [detailsId, setDetailsId] = useState("");
  const [modalMode, setModalMode] = useState<"new" | "edit" | null>(null);
  const [form, setForm] = useState<AcademyForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(() => new Date());
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const [creditModal, setCreditModal] = useState<CreditModalState | null>(null);
  const [creditSaving, setCreditSaving] = useState(false);
  const [columnOrder, setColumnOrder] = useState<CentralAdminColumnKey[]>(() => centralAdminColumns.map((column) => column.key));
  const [draggedColumn, setDraggedColumn] = useState<CentralAdminColumnKey | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setPresenceNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!db || access.accountType !== "developer") {
      return;
    }
    return onSnapshot(collection(db, "academies"), (snapshot) => {
      const next = snapshot.docs.filter((item) => {
        const data = item.data();
        const name = String(data.name ?? "");
        return data.accountType !== "developer" && data.environment !== "test" && data.demoData !== true && !/ambiente de testes|orquestra\.cs/i.test(name);
      }).map((item) => {
        const data = item.data();
        return {
          id: item.id, name: String(data.name ?? "Academia sem nome"), ownerEmail: data.ownerEmail ?? null, plan: ORQUESTRA_PLAN_NAME,
          status: data.status ?? "active", billingStatus: data.billingStatus ?? data.status ?? "active", billingDueDate: data.billingDueDate ?? null,
          monthlyAmount: ORQUESTRA_PLAN_PRICE, createdAt: data.createdAt, contactPhone: data.contactPhone ?? null,
          commercialEmail: data.commercialEmail ?? null, taxId: data.taxId ?? null, legalName: data.legalName ?? null,
          tradeName: data.tradeName ?? null, address: data.address ?? null,
          aiCredits: data.aiCredits && typeof data.aiCredits === "object" ? data.aiCredits as AiCreditsRecord : Number(data.aiCredits ?? 0),
          aiCreditsBalance: Number(data.aiCreditsBalance ?? (data.aiCredits && typeof data.aiCredits === "object" ? data.aiCredits.balance : data.aiCredits) ?? 0),
          aiCreditsTotal: Number(data.aiCreditsTotal ?? data.aiCreditsMonthly ?? (data.aiCredits && typeof data.aiCredits === "object" ? data.aiCredits.included : data.aiCredits) ?? 0),
          aiCreditsMonthly: Number(data.aiCreditsMonthly ?? data.aiCreditsTotal ?? (data.aiCredits && typeof data.aiCredits === "object" ? data.aiCredits.included : data.aiCredits) ?? 0),
          aiCreditsExtras: Number(data.aiCreditsExtras ?? (data.aiCredits && typeof data.aiCredits === "object" ? data.aiCredits.bonus : 0) ?? 0),
        } as AcademyRecord;
      }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setAcademies(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? "");
    }, () => onFeedback("Não foi possível carregar os clientes da Central Admin."));
  }, [access.accountType, onFeedback]);

  useEffect(() => {
    if (!db || !academies.length || access.accountType !== "developer") return;
    const firestore = db;
    const unsubscribers = academies.map((academy) => onSnapshot(collection(firestore, "academies", academy.id, "members"), (snapshot) => {
      setMembersByAcademy((current) => ({ ...current, [academy.id]: snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AcademyMember, "id">) })) }));
    }, () => undefined));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [access.accountType, academies]);

  function moveColumn(target: CentralAdminColumnKey) {
    if (!draggedColumn || draggedColumn === target) return;
    setColumnOrder((current) => {
      const next = current.filter((column) => column !== draggedColumn);
      next.splice(next.indexOf(target), 0, draggedColumn);
      return next;
    });
    setDraggedColumn(null);
  }

  const visibleAcademies = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return academies;
    return academies.filter((academy) => `${academy.name} ${academy.ownerEmail ?? ""} ${academy.plan ?? ""} ${statusLabel(academy.billingStatus)}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [academies, search]);

  const selected = academies.find((academy) => academy.id === selectedId) ?? null;
  const selectedMembers = selected ? membersByAcademy[selected.id] ?? [] : [];
  const activeMembers = selectedMembers.filter((member) => member.active !== false);
  const onlineMembers = selectedMembers.filter((member) => {
    const lastSeen = firestoreDate(member.lastSeenAt);
    return Boolean(lastSeen && lastSeen.getTime() >= presenceNow - 5 * 60 * 1000 && member.presenceStatus !== "left");
  });

  function openEdit(academy: AcademyRecord) {
    setSelectedId(academy.id);
    setForm(academyToForm(academy));
    setModalMode("edit");
  }

  function openCredits(academy: AcademyRecord) {
    setSelectedId(academy.id);
    setCreditModal({ academy, amount: "100", reason: "" });
  }

  function updateCreditForm(field: "amount" | "reason", value: string) {
    setCreditModal((current) => current ? { ...current, [field]: value } : current);
  }

  async function addCredits() {
    if (!creditModal) return;
    const amount = Math.floor(Number(creditModal.amount));
    const reason = creditModal.reason.trim();
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
      onFeedback("Informe uma quantidade inteira entre 1 e 100.000 créditos.");
      return;
    }
    if (reason.length < 5 || reason.length > 300) {
      onFeedback("Informe um motivo entre 5 e 300 caracteres.");
      return;
    }
    if (!window.confirm(`Adicionar ${amount} créditos IA para ${creditModal.academy.name}?\n\nMotivo: ${reason}`)) return;
    const current = academyCredits(creditModal.academy);
    const nextBalance = current.balance + amount;
    const nextExtras = current.extras + amount;
    const nextTotal = current.monthly + nextExtras;
    setCreditSaving(true);
    try {
      if (db && functions) {
        const result = await httpsCallable<{ academyId: string; credits: number; reason: string }, { ok: boolean; balance: number; total: number; extras: number }>(functions, "addAiCredits")({ academyId: creditModal.academy.id, credits: amount, reason });
        const data = result.data;
        setAcademies((currentAcademies) => currentAcademies.map((academy) => academy.id === creditModal.academy.id ? { ...academy, aiCredits: data.balance, aiCreditsBalance: data.balance, aiCreditsMonthly: current.monthly, aiCreditsExtras: data.extras, aiCreditsTotal: data.total } : academy));
      } else {
        setAcademies((currentAcademies) => currentAcademies.map((academy) => academy.id === creditModal.academy.id ? { ...academy, aiCredits: nextBalance, aiCreditsBalance: nextBalance, aiCreditsMonthly: current.monthly, aiCreditsExtras: nextExtras, aiCreditsTotal: nextTotal } : academy));
      }
      setCreditModal(null);
      onFeedback(`${amount} créditos IA adicionados para ${creditModal.academy.name}.`);
    } catch {
      onFeedback("Não foi possível adicionar os créditos IA.");
    } finally {
      setCreditSaving(false);
    }
  }

  function updateForm<K extends keyof AcademyForm>(key: K, value: AcademyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveForm() {
    if (!db || !form.name.trim()) {
      onFeedback("Informe o nome da academia.");
      return;
    }
    setSaving(true);
    try {
      const address = { zip: form.zip, street: form.street, number: form.number, complement: form.complement, neighborhood: form.neighborhood, city: form.city, state: form.state };
      if (modalMode === "edit" && selectedId) {
        await updateDoc(doc(db, "academies", selectedId), {
          name: form.name.trim(), ownerEmail: form.ownerEmail.trim() || null, plan: ORQUESTRA_PLAN_NAME,
          billingStatus: form.status, status: form.status === "suspended" ? "suspended" : "active", monthlyAmount: ORQUESTRA_PLAN_PRICE,
          billingDueDate: form.billingDueDate || null, billingToleranceDays: Number(form.billingToleranceDays) || 5, contactPhone: form.contactPhone.trim() || null,
          commercialEmail: form.commercialEmail.trim() || null, taxId: form.taxId.trim() || null, legalName: form.legalName.trim() || null,
          tradeName: form.tradeName.trim() || null, address, updatedAt: serverTimestamp(), updatedBy: access.userId,
        });
        if (functions) await httpsCallable(functions, "recordAuditEvent")({ academyId: selectedId, action: "central_admin_customer_update", details: null });
        onFeedback("Cadastro do cliente atualizado.");
      } else {
        const academyRef = doc(collection(db, "academies"));
        const random = Array.from(crypto.getRandomValues(new Uint32Array(2))).map((value) => value.toString(36).toUpperCase()).join("").slice(0, 8);
        const code = `DF-${random}`;
        const codeRef = doc(db, "accessCodes", code);
        const batch = writeBatch(db);
        batch.set(academyRef, {
          name: form.name.trim(), ownerId: access.userId, ownerEmail: form.ownerEmail.trim() || null, accountType: "academy_admin",
          environment: "production", demoData: false, plan: ORQUESTRA_PLAN_NAME, status: "active", billingStatus: form.status,
          monthlyAmount: ORQUESTRA_PLAN_PRICE, billingDueDate: form.billingDueDate || null, billingToleranceDays: Number(form.billingToleranceDays) || 5,
          contactPhone: form.contactPhone.trim() || null, commercialEmail: form.commercialEmail.trim() || null, taxId: form.taxId.trim() || null,
          legalName: form.legalName.trim() || null, tradeName: form.tradeName.trim() || null, address, provisionedBy: access.userId, createdAt: serverTimestamp(),
        });
        batch.set(codeRef, { academyId: academyRef.id, role: "admin", academyName: form.name.trim(), invitedEmail: form.ownerEmail.trim() || null, active: true, createdBy: access.userId, createdAt: serverTimestamp() });
        await batch.commit();
        onFeedback(`Cliente criado. Código de convite: ${code}`);
      }
      setModalMode(null);
    } catch {
      onFeedback("Não foi possível salvar este cadastro agora.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(academy: AcademyRecord) {
    if (!db) return;
    const next = academy.billingStatus === "suspended" ? "active" : "suspended";
    try {
      await updateDoc(doc(db, "academies", academy.id), { billingStatus: next, status: next, updatedAt: serverTimestamp(), updatedBy: access.userId });
      onFeedback(next === "suspended" ? "Cliente suspenso." : "Cliente reativado.");
    } catch {
      onFeedback("Não foi possível alterar o status do cliente.");
    }
  }

  function refreshList() {
    setSyncing(true);
    window.setTimeout(() => { setLastSync(new Date()); setSyncing(false); onFeedback("Lista de clientes atualizada."); }, 500);
  }

  if (access.accountType !== "developer") return null;

  const page = <div className="central-admin-screen">
    <aside className="central-admin-sidebar">
      <div className="central-admin-brand"><div className="central-admin-brand-mark"><span>O</span></div><div><small>ORQUESTRA.CS</small><strong>Orquestra Fit</strong></div></div>
      <nav aria-label="Navegação da Central Admin">{navigation.map(([label, Icon]) => <button key={label} type="button" className={label === "Admin Orquestra" ? "active" : ""} onClick={() => label !== "Admin Orquestra" && onFeedback(`${label} permanece na área operacional da academia.`)}><Icon size={16} /><span>{label}</span></button>)}</nav>
      <div className="central-admin-sidebar-footer"><span><LockKeyhole size={13} /> Ambiente protegido</span><small>Central exclusiva Orquestra.cs</small></div>
    </aside>
    <main className="central-admin-main">
      <header className="central-admin-topbar"><div><span>ORQUESTRA.CS · CENTRAL DE CONTROLE</span><h1>Admin Orquestra.cs</h1><p>Controle comercial dos clientes, convites, planos e status de assinatura.</p></div><div className="central-admin-top-actions"><button type="button" className="central-admin-icon-button" aria-label="Buscar cliente" onClick={() => document.querySelector<HTMLInputElement>(".central-admin-search input")?.focus()}><Search size={17} /></button><button type="button" className="central-admin-icon-button" aria-label="Notificações" onClick={() => onFeedback("Não há novas notificações administrativas.")}><Bell size={17} /></button><button type="button" className="central-admin-close" onClick={onClose} aria-label="Fechar Central Admin"><X size={17} /></button></div></header>
      <section className="central-admin-intro-card"><div><span>Admin Orquestra.cs</span><p>Controle comercial dos clientes, convites, planos e status de assinatura.</p><small>Clientes sem configuração usam tolerância de 5 dias úteis</small></div><div className="central-admin-sync"><small>Atualizado em {lastSync.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small><button type="button" onClick={refreshList} disabled={syncing}><CloudCog size={15} />{syncing ? "Sincronizando…" : "Sincronizar Portal"}</button><button type="button" className="central-admin-synced"><span>✓</span> Atualizado</button></div></section>
      <button type="button" className="central-admin-new-client" onClick={() => { setForm(emptyForm()); setModalMode("new"); }}><Plus size={17} /><span><strong>Novo cliente e convite comercial</strong><small>Abra para cadastrar os dados completos e gerar o convite de acesso.</small></span><ChevronDown size={17} /></button>
      <section className="central-admin-table-card">
        <div className="central-admin-table-toolbar"><div><span>CLIENTES COMERCIAIS</span><strong>{visibleAcademies.length} cliente(s)</strong></div><button type="button" onClick={refreshList} aria-label="Atualizar lista"><RefreshCw size={16} /></button></div>
        <label className="central-admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, plano ou status" aria-label="Buscar cliente, plano ou status" /></label>
        <div className="central-admin-table-scroll"><div className="central-admin-table" role="table" aria-label="Clientes da Orquestra.cs"><div className="central-admin-table-head" role="row" aria-label="Arraste os cabeçalhos para reorganizar" style={Object.fromEntries(columnOrder.map((column, index) => [`--central-${column}`, index + 1])) as CSSProperties}>{columnOrder.map((column) => <span key={column} data-column={column} draggable onDragStart={() => setDraggedColumn(column)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveColumn(column)} title="Arraste para reorganizar">⠿ {centralAdminColumns.find((item) => item.key === column)?.label}</span>)}</div>
          {visibleAcademies.length === 0 ? <div className="central-admin-empty"><Building2 size={22} /><p>{academies.length ? "Nenhum cliente encontrado para este filtro." : "Nenhum cliente comercial cadastrado ainda."}</p></div> : visibleAcademies.map((academy) => {
            const members = membersByAcademy[academy.id] ?? [];
            const lastAccess = members.map((member) => firestoreDate(member.lastAccessAt)).filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0];
            const online = members.some((member) => { const date = firestoreDate(member.lastSeenAt); return Boolean(date && date.getTime() >= presenceNow - 5 * 60 * 1000 && member.presenceStatus !== "left"); });
            const calculated = calculatedStatus(academy);
            const credits = academyCredits(academy);
            const gridStyle = Object.fromEntries(columnOrder.map((column, index) => [`--central-${column}`, index + 1])) as CSSProperties;
            return <div className="central-admin-client-group" key={academy.id}><div className="central-admin-client-row" role="row" style={gridStyle}><div className="central-admin-cell central-admin-client-name" data-label="Cliente"><i>{initials(academy.name)}</i><span><strong>{academy.name}</strong><small>{academy.ownerEmail || "Responsável não informado"}</small><em>{academy.contactPhone || "Contato não informado"}</em><b>{academy.billingStatus === "past_due" ? "Cobrança em atraso" : "Sem cobrança PIX"}</b></span></div><div className="central-admin-cell" data-label="Plano">{ORQUESTRA_PLAN_NAME}</div><div className="central-admin-cell" data-label="Status"><em className={`central-admin-status ${statusTone(academy.billingStatus)}`}>{statusLabel(academy.billingStatus)}</em></div><div className="central-admin-cell" data-label="Inscrição">{dateLabel(academy.createdAt)}</div><div className="central-admin-cell" data-label="Vencimento">{academy.billingDueDate ? dateLabel(academy.billingDueDate) : "Sem vencimento"}</div><div className="central-admin-cell" data-label="Situação calculada"><em className={`central-admin-calculated ${calculated.tone}`}>{calculated.label}</em></div><div className="central-admin-cell" data-label="Último acesso">{dateTimeLabel(lastAccess)}</div><div className="central-admin-cell" data-label="Online"><em className={online ? "central-admin-online online" : "central-admin-online"}>{online ? "Online" : "Offline"}</em></div><div className="central-admin-cell" data-label="Créditos IA">{credits.balance}/{credits.total}</div><div className="central-admin-actions" data-label="Ação"><button type="button" onClick={() => openEdit(academy)} aria-label={`Editar ${academy.name}`} title="Editar"><Pencil size={15} /></button><button type="button" onClick={() => openCredits(academy)} aria-label={`Adicionar créditos IA para ${academy.name}`} title="Adicionar créditos IA"><Sparkles size={15} /></button><button type="button" onClick={() => openEdit(academy)} aria-label={`Abrir cobrança de ${academy.name}`} title="Cobrança"><CircleDollarSign size={15} /></button><button type="button" onClick={() => void toggleStatus(academy)} aria-label={`Alterar status de ${academy.name}`} title="Suspender ou reativar"><PauseCircle size={15} /></button><button type="button" onClick={() => onFeedback("Para preservar o histórico, o cliente deve ser suspenso em vez de excluído.")} aria-label={`Preservar histórico de ${academy.name}`} title="Preservar histórico"><Trash2 size={15} /></button></div></div><button type="button" className="central-admin-details-toggle" onClick={() => { setSelectedId(academy.id); setDetailsId((current) => current === academy.id ? "" : academy.id); }}><span><strong>Detalhes operacionais</strong><small>{academy.name} · atualização {dateTimeLabel(academy.createdAt)}</small></span><span>{detailsId === academy.id ? "Fechar detalhes" : "Abrir detalhes"} <ChevronRight size={14} /></span></button>{detailsId === academy.id && <div className="central-admin-details"><div className="central-admin-detail-card"><header><strong>SINCRONIZAÇÃO COM PORTAL</strong><em>Sincronizado</em></header><dl><div><dt>Identificador externo</dt><dd>{academy.id}</dd></div><div><dt>ID interno</dt><dd>{academy.id}</dd></div><div><dt>Última atualização</dt><dd>{dateTimeLabel(academy.createdAt)}</dd></div><div><dt>Última sincronização</dt><dd>{lastSync.toLocaleString("pt-BR")}</dd></div></dl></div><div className="central-admin-detail-card"><header><strong>Usuários e acessos</strong><em>Administradores: {members.filter((member) => member.role === "admin").length}/4</em></header><div className="central-admin-owner"><ShieldCheck size={16} /><span><small>RESPONSÁVEL PRINCIPAL</small><strong>{academy.ownerEmail || "Responsável não informado"}</strong><em>{academy.ownerEmail ? "Gmail cadastrado" : "Gmail não informado"}</em></span></div><div className="central-admin-detail-summary"><span>Colaboradores administrativos</span><strong>{members.filter((member) => member.role === "teacher").length} cadastrado(s)</strong></div><div className="central-admin-detail-summary"><span>Usuários finais</span><strong>{activeMembers.length} ativo(s) · {onlineMembers.length} online</strong></div></div></div>}</div>;
          })}
        </div></div>
      </section>
      <footer className="central-admin-footer"><span><LockKeyhole size={13} /> Dados isolados por cliente e protegidos pelo Firebase.</span><small>Desenvolvido por <strong>Orquestra.cs</strong></small></footer>
    </main>
    {creditModal && <AiCreditsModal state={creditModal} onClose={() => setCreditModal(null)} onChange={updateCreditForm} onSubmit={() => void addCredits()} saving={creditSaving} />}
    {modalMode && <div className="central-admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="central-admin-modal-title"><section className="central-admin-modal"><header><div><span>CADASTRO COMPLETO DO CLIENTE</span><h2 id="central-admin-modal-title">{modalMode === "new" ? "Novo cliente e convite" : `Editar ${form.name}`}</h2><p>Altere os dados e salve o resultado de forma segura.</p></div><button type="button" onClick={() => setModalMode(null)} aria-label="Fechar formulário"><X size={17} /></button></header><form onSubmit={(event) => { event.preventDefault(); void saveForm(); }}><section className="central-admin-plan-reference"><div><span>PLANO ORQUESTRA.CS</span><strong>{ORQUESTRA_PLAN_NAME}</strong><small>Plano único vigente para os clientes.</small></div><b>R$ {ORQUESTRA_PLAN_PRICE.toFixed(2).replace(".", ",")} / mês</b></section><div className="central-admin-form-grid"><label>Nome da empresa<input value={form.name} onChange={(event) => updateForm("name", event.target.value)} required /></label><label>Plano<input value={ORQUESTRA_PLAN_NAME} readOnly /></label><label>Situação<select value={form.status} onChange={(event) => updateForm("status", event.target.value as AcademyForm["status"])}><option value="active">ativo</option><option value="past_due">em atraso</option><option value="suspended">suspenso</option></select></label><label>Responsável<input value={form.ownerEmail} onChange={(event) => updateForm("ownerEmail", event.target.value)} placeholder="Nome ou Gmail" /></label><label>Telefone/WhatsApp<input value={form.contactPhone} onChange={(event) => updateForm("contactPhone", event.target.value)} /></label><label>E-mail comercial<input type="email" value={form.commercialEmail} onChange={(event) => updateForm("commercialEmail", event.target.value)} /></label><label>Mensalidade<input value={`R$ ${ORQUESTRA_PLAN_PRICE.toFixed(2).replace(".", ",")}`} readOnly /></label><label>Tolerância após vencimento<input value={form.billingToleranceDays} onChange={(event) => updateForm("billingToleranceDays", event.target.value)} inputMode="numeric" /></label><label>Dia de vencimento<input type="date" value={form.billingDueDate} onChange={(event) => updateForm("billingDueDate", event.target.value)} /></label><label>Forma de pagamento<select value={form.paymentMethod} onChange={(event) => updateForm("paymentMethod", event.target.value)}><option>Pix</option><option>Boleto</option><option>Cartão</option><option>Transferência</option></select></label><label>Data de início<input type="date" value={form.startDate} onChange={(event) => updateForm("startDate", event.target.value)} /></label><label className="central-admin-form-wide">Observações internas<textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Observações sobre o cliente" /></label></div><section className="central-admin-cadastral"><header><div><strong>Dados cadastrais e localização</strong><small>Consulte os dados quando desejar e confirme antes de salvar.</small></div><FileText size={17} /></header><div className="central-admin-form-grid"><label>CNPJ / CPF<input value={form.taxId} onChange={(event) => updateForm("taxId", event.target.value)} /></label><label>Razão social<input value={form.legalName} onChange={(event) => updateForm("legalName", event.target.value)} /></label><label>Nome fantasia<input value={form.tradeName} onChange={(event) => updateForm("tradeName", event.target.value)} /></label><label>CEP<input value={form.zip} onChange={(event) => updateForm("zip", event.target.value)} /></label><label>Endereço<input value={form.street} onChange={(event) => updateForm("street", event.target.value)} /></label><label>Número<input value={form.number} onChange={(event) => updateForm("number", event.target.value)} /></label><label>Complemento<input value={form.complement} onChange={(event) => updateForm("complement", event.target.value)} /></label><label>Bairro<input value={form.neighborhood} onChange={(event) => updateForm("neighborhood", event.target.value)} /></label><label>Cidade<input value={form.city} onChange={(event) => updateForm("city", event.target.value)} /></label><label>UF<input value={form.state} onChange={(event) => updateForm("state", event.target.value)} /></label></div></section><footer><button type="button" className="central-admin-secondary" onClick={() => setModalMode(null)}>Cancelar</button><button type="submit" className="central-admin-primary" disabled={saving}>{saving ? "Salvando…" : modalMode === "new" ? "Criar cliente e convite" : "Salvar alterações"}</button></footer></form></section></div>}
  </div>;

  return fullScreen ? page : page;
}
