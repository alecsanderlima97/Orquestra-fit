"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Dumbbell, Printer, Search, ChevronLeft } from "lucide-react";
import { useAccess } from "@/components/auth/access-context";
import { db } from "@/lib/firebase/client";
import { matchesSearch } from "@/lib/search";
import { exerciseMetricLabels, type ExerciseMetricSource } from "@/lib/workouts/exercise-metrics";

type Exercise = ExerciseMetricSource & { exerciseId?: string; sets?: string; reps?: string; load?: string; rest?: string; instructions?: string };
type Sheet = { id: string; name: string; level?: string; sourceTemplateId?: string; exerciseDetails?: Exercise[] };

function escapePrintText(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function openPrintDocument(sheets: Sheet[], studentName: string, title: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.opener = null;
  const logoUrl = `${window.location.origin}/dama-de-ferro.jpeg`;
  const sections = sheets.map((sheet) => {
    const rows = sheet.exerciseDetails?.length ? sheet.exerciseDetails.map((exercise, index) => {
      const metrics = exerciseMetricLabels(exercise);
      return `<tr><td><strong>${escapePrintText(exercise.name)}</strong>${exercise.instructions ? `<small>${escapePrintText(exercise.instructions)}</small>` : ""}</td><td>${escapePrintText(exercise.sets || "—")}</td><td>${escapePrintText(exercise.reps ? `${exercise.reps} ${metrics.repsUnit}` : "—")}</td><td>${escapePrintText(exercise.load ? `${exercise.load} ${metrics.loadUnit}` : "—")}</td><td>${escapePrintText(exercise.rest || "—")}</td></tr>`;
    }).join("") : `<tr><td colspan="5">Detalhes dos exercícios ainda não cadastrados.</td></tr>`;
    return `<section class="sheet"><p class="level">${escapePrintText(sheet.level || "PROGRAMA ATUAL")}</p><h2>${escapePrintText(sheet.name)}</h2><table><thead><tr><th>Exercício</th><th>Séries / blocos</th><th>Repetições / tempo</th><th>Carga / velocidade</th><th>Descanso (s)</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join("");
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapePrintText(title)} · ${escapePrintText(studentName)}</title><style>@page{margin:12mm}*{box-sizing:border-box}body{margin:0 auto;max-width:190mm;color:#17211d;background:#fff;font-family:Arial,sans-serif;font-size:10pt}header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #b17b3f;padding-bottom:10px;margin-bottom:18px}header img{width:54px;height:54px;object-fit:cover;border-radius:10px}header strong{display:block;font-size:17pt;letter-spacing:.04em}header span{display:block;color:#9b6c3c;font-size:8pt;letter-spacing:.16em;margin-top:3px}.student{margin:0 0 18px;color:#4b5b53}.student strong{display:block;color:#17211d;font-size:12pt;margin-top:4px}.sheet{break-inside:avoid;margin:0 0 24px}.level{margin:0;color:#9b6c3c;font-size:8pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.sheet h2{margin:5px 0 12px;font-family:Georgia,serif;font-size:16pt}.sheet table{width:100%;border-collapse:collapse;table-layout:fixed}.sheet th,.sheet td{border-bottom:1px solid #c7ceca;padding:7px 5px;text-align:left;vertical-align:top}.sheet th{color:#52635a;font-size:7.5pt;text-transform:uppercase}.sheet th:first-child,.sheet td:first-child{width:38%}.sheet td small{display:block;color:#5d6e65;font-size:7.5pt;line-height:1.3;margin-top:3px}footer{border-top:1px dashed #aeb8b2;padding-top:9px;color:#607069;text-align:center;font-size:7.5pt}</style></head><body><header><img src="${logoUrl}" alt="Dama de Ferro Academia"><div><strong>DAMA DE FERRO</strong><span>ACADEMIA</span></div></header><main><h1>${escapePrintText(title)}</h1><p class="student">Aluno<strong>${escapePrintText(studentName)}</strong></p>${sections}</main><footer>Material de treino da Dama de Ferro Academia · Desenvolvido por Orquestra.cs</footer></body></html>`);
  printWindow.document.close();
  const startPrint = () => { printWindow.focus(); printWindow.print(); printWindow.onafterprint = () => printWindow.close(); };
  window.setTimeout(startPrint, 250);
  return true;
}

export function KioskWorkouts() {
  const access = useAccess();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printError, setPrintError] = useState("");
  const detail = useRef<HTMLDivElement>(null);
  const selected = sheets.find((sheet) => sheet.id === selectedId);
  useEffect(() => {
    if (!db || access.role !== "student") { setLoading(false); return; }
    const firestore = db;
    const queries = [
      query(collection(firestore, "academies", access.academyId, "workouts"), where("studentId", "==", access.userId), where("status", "==", "published")),
      query(collection(firestore, "academies", access.academyId, "workouts"), where("studentUserId", "==", access.userId)),
      query(collection(firestore, "academies", access.academyId, "workoutTemplates"), where("targetStudentId", "==", access.userId)),
    ];
    const groups: Sheet[][] = queries.map(() => []);
    const ready = new Set<number>();
    const subscriptions = queries.map((source, index) => onSnapshot(source, (snapshot) => {
      groups[index] = snapshot.docs.filter((item) => index === 2 ? item.data().audience === "Personalizado" : item.data().status === "published").map((item) => ({ ...item.data(), id: index === 2 ? `template-${item.id}` : item.id, sourceTemplateId: index === 2 ? item.id : item.data().sourceTemplateId } as Sheet));
      const seen = new Set<string>();
      setSheets(groups.flat().filter((sheet) => {
        const key = sheet.sourceTemplateId || sheet.id;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }));
      ready.add(index); setLoading(ready.size < queries.length);
    }, () => { ready.add(index); setError(true); setLoading(ready.size < queries.length); }));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [access.academyId, access.userId, access.role]);
  useEffect(() => {
    if (selectedId) { detail.current?.focus(); detail.current?.scrollIntoView({ block: "start", behavior: "auto" }); }
  }, [selectedId]);
  function printAllSheets() {
    setPrintError("");
    if (!openPrintDocument(sheets, name, "Treinos liberados")) setPrintError("A janela de impressão foi bloqueada. Permita pop-ups neste computador e tente novamente.");
  }
  if (access.role !== "student") return <section className="kiosk-workouts"><h1>Acesso do aluno</h1><p>Este terminal mostra fichas de alunos. Saia e entre com a conta do aluno para consultar os treinos.</p></section>;
  const name = access.user.displayName || "Aluno";
  return <section className="kiosk-workouts">
    {selected ? <div ref={detail} tabIndex={-1} className="kiosk-sheet">
      <button className="kiosk-back" onClick={() => setSelectedId(null)}><ChevronLeft size={18} />Voltar às fichas</button>
      <span className="kiosk-eyebrow">FICHA DE TREINO · {selected.level || "PROGRAMA ATUAL"}</span>
      <h1>{selected.name}</h1><p>{name}</p>
      {selected.exerciseDetails?.length ? <>
        <div className="kiosk-sheet-table"><table><thead><tr><th>Exercício</th><th>Séries / blocos</th><th>Repetições / tempo</th><th>Carga / velocidade</th><th>Descanso (s)</th></tr></thead><tbody>
          {selected.exerciseDetails.map((exercise, index) => {
            const metrics = exerciseMetricLabels(exercise);
            return <tr key={`${exercise.exerciseId}-${index}`}><td><strong>{exercise.name}</strong>{exercise.instructions && <small>{exercise.instructions}</small>}</td><td>{exercise.sets || "—"}</td><td>{exercise.reps ? `${exercise.reps} ${metrics.repsUnit}` : "—"}</td><td>{exercise.load ? `${exercise.load} ${metrics.loadUnit}` : "—"}</td><td>{exercise.rest || "—"}</td></tr>;
          })}
        </tbody></table></div>
        <button className="kiosk-primary kiosk-print" onClick={() => { setPrintError(""); if (!openPrintDocument([selected], name, selected.name)) setPrintError("A janela de impressão foi bloqueada. Permita pop-ups neste computador e tente novamente."); }}><Printer size={19} />Imprimir esta ficha</button>
        <p className="kiosk-print-help">Na janela de impressão, escolha a impressora ou “Salvar como PDF”. Para levar no celular, use o QR code ao lado.</p>
        {printError && <p className="kiosk-print-error" role="alert">{printError}</p>}
      </> : <p>Esta ficha ainda não tem os detalhes dos exercícios. Procure o professor.</p>}
    </div> : <>
      <span className="kiosk-eyebrow">SUAS FICHAS LIBERADAS</span><h1>Olá, {name.split(" ")[0]}.</h1><p>Escolha o treino que deseja consultar ou imprimir.</p>
      <div className="kiosk-list-actions"><label className="kiosk-search"><Search size={20} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar meu treino" aria-label="Buscar meu treino" /></label><button className="kiosk-primary kiosk-print-all" type="button" onClick={printAllSheets} disabled={!sheets.length}><Printer size={19} />Imprimir todos os treinos</button></div>
      {printError && <p className="kiosk-print-error" role="alert">{printError}</p>}
      {loading && <p role="status">Carregando suas fichas…</p>}
      {error && <p role="alert">Não foi possível carregar todas as fichas. Saia e tente novamente ou procure a recepção.</p>}
      <div className="kiosk-sheets">{sheets.filter((sheet) => matchesSearch(search, sheet.name, sheet.level)).map((sheet) => <button key={sheet.id} onClick={() => setSelectedId(sheet.id)}><Dumbbell size={23} /><span><small>{sheet.level || "Seu programa"}</small><strong>{sheet.name}</strong><small>{sheet.exerciseDetails?.length || 0} exercícios</small></span><span className="kiosk-sheet-action">Ver ficha →</span></button>)}</div>
      {!loading && !error && !sheets.length && <p>Nenhuma ficha liberada ainda. Fale com o professor.</p>}
      {sheets.length > 0 && !sheets.some((sheet) => matchesSearch(search, sheet.name, sheet.level)) && <p>Nenhum treino corresponde à busca.</p>}
    </>}
  </section>;
}
