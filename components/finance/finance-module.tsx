"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { Banknote, BarChart3, Building2, CalendarClock, FileText, Printer, Receipt, WalletCards } from "lucide-react";
import { useAccess } from "@/components/auth/access-context";
import { db } from "@/lib/firebase/client";

type Charge = { id: string; studentName: string; planName: string; amount: number; dueDate: string; status: "pending" | "paid"; chargeType?: string };
type ExpenseKind = "payable" | "supplier" | "fixed";
type Expense = { id: string; kind: ExpenseKind; description: string; supplier?: string; amount: number; dueDate: string; status: "pending" | "paid" };
type Invoice = { id: string; number: string; customer: string; amount: number; issueDate: string; status: "issued" | "cancelled" };
type Tab = "overview" | "plans" | "payable" | "supplier" | "invoices" | "fixed" | "reports";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const monthStart = () => `${today().slice(0, 7)}-01`;
const addMonths = (date: string, months: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setMonth(value.getMonth() + months);
  return value.toISOString().slice(0, 10);
};

export function FinanceModule({ onFeedback, billing }: { onFeedback: (message: string) => void; billing: React.ReactNode }) {
  const access = useAccess();
  const [tab, setTab] = useState<Tab>("overview");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(today());
  const [repeatCount, setRepeatCount] = useState("1");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceCustomer, setInvoiceCustomer] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  useEffect(() => {
    if (!db) {
      const read = <T,>(name: string): T[] => { try { return JSON.parse(localStorage.getItem(`orquestra-fit:${access.academyId}:${name}`) || "[]") as T[]; } catch { return []; } };
      const sync = () => { setCharges(read<Charge>("monthlyCharges")); setExpenses(read<Expense>("financialExpenses")); setInvoices(read<Invoice>("invoices")); };
      sync(); window.addEventListener("orquestra-fit:collection-updated", sync); return () => window.removeEventListener("orquestra-fit:collection-updated", sync);
    }
    const offCharges = onSnapshot(collection(db, "academies", access.academyId, "monthlyCharges"), (snap) => setCharges(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Charge, "id">), amount: Number(item.data().amount || 0) }))));
    const offExpenses = onSnapshot(collection(db, "academies", access.academyId, "financialExpenses"), (snap) => setExpenses(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Expense, "id">), amount: Number(item.data().amount || 0) }))));
    const offInvoices = onSnapshot(collection(db, "academies", access.academyId, "invoices"), (snap) => setInvoices(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Invoice, "id">), amount: Number(item.data().amount || 0) }))));
    return () => { offCharges(); offExpenses(); offInvoices(); };
  }, [access.academyId]);

  const inPeriod = (date: string) => date >= from && date <= to;
  const reportCharges = charges.filter((item) => inPeriod(item.dueDate));
  const reportExpenses = expenses.filter((item) => inPeriod(item.dueDate));
  const revenue = reportCharges.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount, 0);
  const expectedRevenue = reportCharges.reduce((sum, item) => sum + item.amount, 0);
  const paidExpenses = reportExpenses.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount, 0);
  const debt = reportExpenses.filter((item) => item.status !== "paid").reduce((sum, item) => sum + item.amount, 0);
  const profit = revenue - paidExpenses;
  const visibleExpenses = expenses.filter((item) => item.kind === tab);
  const currentDay = today();
  const dueSoonExpenses = expenses.filter((item) => item.status !== "paid" && item.dueDate >= currentDay && item.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const overdueExpenses = expenses.filter((item) => item.status !== "paid" && item.dueDate < currentDay);
  const overdueCharges = charges.filter((item) => item.status !== "paid" && item.dueDate < currentDay);

  function writeLocal<T>(name: string, data: T[]) { localStorage.setItem(`orquestra-fit:${access.academyId}:${name}`, JSON.stringify(data)); window.dispatchEvent(new Event("orquestra-fit:collection-updated")); }
  async function saveExpense(event: React.FormEvent) {
    event.preventDefault();
    if (!(tab === "payable" || tab === "supplier" || tab === "fixed") || !description.trim() || !amount || !dueDate) return;
    const count = Math.min(36, Math.max(1, Number.parseInt(repeatCount, 10) || 1));
    const entries = Array.from({ length: count }, (_, index) => ({ kind: tab, description: count > 1 ? `${description.trim()} (${index + 1}/${count})` : description.trim(), supplier: supplier.trim() || null, amount: Number(amount.replace(",", ".")), dueDate: addMonths(dueDate, index), status: "pending" as const }));
    if (!db) writeLocal("financialExpenses", [...entries.map((data, index) => ({ id: `local-expense-${Date.now()}-${index}`, ...data })), ...expenses]);
    else for (const data of entries) await addDoc(collection(db, "academies", access.academyId, "financialExpenses"), { ...data, createdBy: access.userId, createdAt: serverTimestamp() });
    setDescription(""); setSupplier(""); setAmount(""); setRepeatCount("1"); onFeedback(count > 1 ? `${count} parcelas registradas com vencimentos mensais.` : "Conta registrada no financeiro.");
  }
  async function toggleExpense(item: Expense) {
    const status = item.status === "paid" ? "pending" : "paid";
    if (!db) writeLocal("financialExpenses", expenses.map((current) => current.id === item.id ? { ...current, status } : current));
    else await updateDoc(doc(db, "academies", access.academyId, "financialExpenses", item.id), { status, paidAt: status === "paid" ? serverTimestamp() : null });
    onFeedback(status === "paid" ? "Conta marcada como paga." : "Conta reaberta.");
  }
  async function saveInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (!invoiceNumber.trim() || !invoiceCustomer.trim() || !invoiceAmount) return;
    const data = { number: invoiceNumber.trim(), customer: invoiceCustomer.trim(), amount: Number(invoiceAmount.replace(",", ".")), issueDate: today(), status: "issued" as const };
    if (!db) writeLocal("invoices", [{ id: `local-invoice-${Date.now()}`, ...data }, ...invoices]);
    else await addDoc(collection(db, "academies", access.academyId, "invoices"), { ...data, createdBy: access.userId, createdAt: serverTimestamp() });
    setInvoiceNumber(""); setInvoiceCustomer(""); setInvoiceAmount(""); onFeedback("Nota fiscal registrada.");
  }

  const tabs: Array<[Tab, string, React.ElementType]> = [["overview", "Visão financeira", BarChart3], ["plans", "Planos e mensalidades", WalletCards], ["payable", "Contas a pagar", CalendarClock], ["supplier", "Boletos de fornecedores", Building2], ["invoices", "Notas fiscais", FileText], ["fixed", "Contas fixas", Receipt], ["reports", "Relatórios", Printer]];
  const expenseTitle = tab === "supplier" ? "Boleto de fornecedor" : tab === "fixed" ? "Conta fixa" : "Conta a pagar";
  return <div className="workspace-content finance-module">
    <section className="workspace-intro"><div><span>GESTÃO FINANCEIRA</span><h2>Financeiro</h2><p>Receitas, despesas, documentos e resultado da academia em um único lugar.</p></div></section>
    <nav className="finance-tabs">{tabs.map(([id, label, Icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon />{label}</button>)}</nav>
    {tab === "plans" ? billing : tab === "overview" || tab === "reports" ? <>
      <section className="finance-period"><label>De<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Até<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>{tab === "reports" && <button onClick={() => window.print()}><Printer /> Imprimir relatório</button>}</section>
      <section className="finance-kpis"><article><small>Receita recebida</small><strong>{money(revenue)}</strong><span>Mensalidades, inscrições e serviços</span></article><article><small>Despesas pagas</small><strong>{money(paidExpenses)}</strong><span>Saídas confirmadas no período</span></article><article className={profit < 0 ? "negative" : "positive"}><small>Lucro líquido</small><strong>{money(profit)}</strong><span>Receita recebida menos despesas pagas</span></article><article className="negative"><small>Dívida em aberto</small><strong>{money(debt)}</strong><span>Contas ainda pendentes</span></article></section>
      {tab === "overview" && <section className="finance-alert-grid"><article className="finance-alert upcoming"><header><CalendarClock /><div><span>LEMBRETES</span><h3>Vencendo nos próximos 7 dias</h3></div><b>{dueSoonExpenses.length}</b></header>{dueSoonExpenses.length === 0 ? <p>Nenhuma conta próxima do vencimento.</p> : dueSoonExpenses.slice(0, 5).map((item) => <p key={item.id}><span>{item.description}</span><strong>{money(item.amount)} · {item.dueDate.split("-").reverse().join("/")}</strong></p>)}</article><article className="finance-alert overdue"><header><Banknote /><div><span>ATENÇÃO</span><h3>Inadimplentes e contas vencidas</h3></div><b>{overdueCharges.length + overdueExpenses.length}</b></header>{overdueCharges.length === 0 && overdueExpenses.length === 0 ? <p>Nenhum vencimento em aberto.</p> : <>{overdueCharges.slice(0, 4).map((item) => <p key={item.id}><span>Aluno · {item.studentName}</span><strong>{money(item.amount)} · vencida</strong></p>)}{overdueExpenses.slice(0, 4).map((item) => <p key={item.id}><span>{item.description}</span><strong>{money(item.amount)} · vencida</strong></p>)}</>}</article></section>}
      {tab === "reports" && <section className="workspace-panel financial-report"><header><div><span>RELATÓRIO DO PERÍODO</span><h3>{from.split("-").reverse().join("/")} a {to.split("-").reverse().join("/")}</h3></div></header><div className="report-lines"><p><span>Receita prevista</span><strong>{money(expectedRevenue)}</strong></p><p><span>Receita realizada</span><strong>{money(revenue)}</strong></p><p><span>Despesas pagas</span><strong>{money(paidExpenses)}</strong></p><p><span>Dívidas pendentes</span><strong>{money(debt)}</strong></p><p className="report-total"><span>Resultado líquido</span><strong>{money(profit)}</strong></p></div><div className="report-detail"><h4>Receitas</h4>{reportCharges.map((item) => <p key={item.id}><span>{item.studentName} · {item.planName}</span><b>{money(item.amount)}</b></p>)}<h4>Despesas</h4>{reportExpenses.map((item) => <p key={item.id}><span>{item.description}</span><b>{money(item.amount)}</b></p>)}</div></section>}
    </> : tab === "invoices" ? <section className="finance-entry-layout"><form className="workspace-panel finance-entry-form" onSubmit={saveInvoice}><header><div><span>DOCUMENTO FISCAL</span><h3>Registrar nota fiscal</h3></div></header><label>Número da nota<input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required /></label><label>Cliente / destinatário<input value={invoiceCustomer} onChange={(event) => setInvoiceCustomer(event.target.value)} required /></label><label>Valor<input inputMode="decimal" value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)} required /></label><button>Salvar nota</button></form><article className="workspace-panel finance-list"><header><div><span>NOTAS REGISTRADAS</span><h3>{invoices.length} documento(s)</h3></div></header>{invoices.map((item) => <div key={item.id}><span><strong>NF {item.number}</strong><small>{item.customer} · {item.issueDate}</small></span><b>{money(item.amount)}</b></div>)}</article></section> : <section className="finance-entry-layout"><form className="workspace-panel finance-entry-form" onSubmit={saveExpense}><header><div><span>NOVA DESPESA</span><h3>{expenseTitle}</h3></div></header><label>Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} required /></label>{tab === "supplier" && <label>Fornecedor<input value={supplier} onChange={(event) => setSupplier(event.target.value)} required /></label>}<label>Valor<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>{tab === "fixed" ? "Próximo vencimento" : "Vencimento"}<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label><label>Quantidade de vezes<input type="number" min="1" max="36" value={repeatCount} onChange={(event) => setRepeatCount(event.target.value)} /><small className="finance-field-help">Cada ocorrência terá seu próprio vencimento mensal.</small></label><button>Registrar</button></form><article className="workspace-panel finance-list"><header><div><span>LANÇAMENTOS</span><h3>{visibleExpenses.length} conta(s)</h3></div></header>{visibleExpenses.map((item) => <div key={item.id}><span><strong>{item.description}</strong><small>{item.supplier ? `${item.supplier} · ` : ""}vence {item.dueDate.split("-").reverse().join("/")}</small></span><b>{money(item.amount)}</b><button className={item.status} onClick={() => void toggleExpense(item)}>{item.status === "paid" ? "Paga" : "Dar baixa"}</button></div>)}</article></section>}
  </div>;
}
