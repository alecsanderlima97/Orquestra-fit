"use client";

import { useState } from "react";
import { Activity, ArrowUpRight, Banknote, BarChart3, CalendarDays, Check, ChevronRight, CircleDollarSign, Dumbbell, House, Menu, Play, Search, Settings, Users, WalletCards } from "lucide-react";

const students = [
  { name: "Ana Paula", plan: "Semestral", due: "Em dia", visits: 18 },
  { name: "Carlos Eduardo", plan: "Mensal", due: "Vence hoje", visits: 12 },
  { name: "Mariana Souza", plan: "Anual", due: "Em dia", visits: 21 },
  { name: "João Henrique", plan: "Mensal", due: "Atrasado", visits: 7 },
];
const exercises = [
  { name: "Supino reto", detail: "4 séries • 10 repetições", last: "Última carga: 30 kg" },
  { name: "Supino inclinado", detail: "3 séries • 12 repetições", last: "Última carga: 18 kg" },
  { name: "Crucifixo máquina", detail: "3 séries • 12 repetições", last: "Última carga: 35 kg" },
];

export default function Home() {
  const [mode, setMode] = useState<"gestao" | "aluno">("gestao");
  const [tab, setTab] = useState("Visão geral");
  const [done, setDone] = useState<number[]>([]);
  return <main className="app-shell">
    <div className="mode-switch"><button className={mode==="gestao"?"active":""} onClick={()=>setMode("gestao")}>Gestão</button><button className={mode==="aluno"?"active":""} onClick={()=>setMode("aluno")}>App do aluno</button></div>
    {mode==="gestao" ? <section className="dashboard">
      <aside className="sidebar"><div className="brand"><span>O</span> Orquestra <b>Fit</b></div><nav>
        {([["Visão geral",House],["Alunos",Users],["Financeiro",WalletCards],["Treinos",Dumbbell],["Aulas",CalendarDays],["Relatórios",BarChart3]] as const).map(([label,Icon])=><button key={label} className={tab===label?"selected":""} onClick={()=>setTab(label)}><Icon size={20}/><span>{label}</span></button>)}
      </nav><button className="settings"><Settings size={20}/> <span>Configurações</span></button></aside>
      <div className="workspace"><header className="topbar"><div><p>SEGUNDA-FEIRA, 1 DE SETEMBRO</p><h1>{tab}</h1></div><div className="admin"><span>AL</span><div><b>Alecsander Lima</b><small>Administrador</small></div></div></header>
      <div className="content"><section className="welcome"><div><small>RESUMO DE HOJE</small><h2>Boa tarde, Alecsander.</h2><p>A academia está com bom movimento. Você já recebeu 82% das mensalidades deste mês.</p></div><div className="pulse"><Activity size={30}/><span>37</span><small>alunos agora</small></div></section>
      <section className="stats"><Stat icon={<Users/>} label="Alunos ativos" value="184" change="+8 este mês"/><Stat icon={<CircleDollarSign/>} label="Receita em setembro" value="R$ 21.460" change="82% recebido"/><Stat icon={<Banknote/>} label="A receber" value="R$ 4.720" change="31 mensalidades" warning/><Stat icon={<CalendarDays/>} label="Aulas hoje" value="7" change="46 reservas"/></section>
      <section className="grid-main"><article className="panel students-panel"><div className="panel-head"><div><h3>Alunos</h3><p>Acompanhe presença e situação dos planos</p></div><button className="primary">+ Novo aluno</button></div><div className="search"><Search size={18}/><input placeholder="Buscar aluno..."/></div>
      <div className="table"><div className="tr labels"><span>Aluno</span><span>Plano</span><span>Situação</span><span>Frequência</span><span/></div>{students.map(s=><div className="tr" key={s.name}><span className="student"><i>{s.name.split(" ").map(n=>n[0]).slice(0,2).join("")}</i><b>{s.name}</b></span><span>{s.plan}</span><span><em className={s.due==="Atrasado"?"late":s.due==="Vence hoje"?"today":""}>{s.due}</em></span><span>{s.visits} visitas</span><ChevronRight size={18}/></div>)}</div></article>
      <aside className="panel finance-panel"><div className="panel-head"><div><h3>Financeiro</h3><p>Setembro de 2026</p></div><ArrowUpRight size={20}/></div><div className="ring"><div><strong>82%</strong><span>recebido</span></div></div><Money label="Recebido" value="R$ 21.460" color="green"/><Money label="Pendente" value="R$ 3.320" color="amber"/><Money label="Atrasado" value="R$ 1.400" color="red"/><button className="secondary">Ver financeiro completo</button></aside></section></div></div>
    </section> : <section className="phone"><header className="mobile-head"><div className="mobile-brand"><span>O</span> Orquestra <b>Fit</b></div><button><Menu/></button></header><div className="mobile-content"><p className="eyebrow">SEGUNDA, 1 DE SETEMBRO</p><h1>Boa tarde, Alecsander.</h1>
      <div className="streak"><span>🔥</span><div><b>Sequência de 4 treinos</b><small>Continue assim. Sua evolução agradece.</small></div></div>
      <article className="workout-card"><div className="workout-top"><div><small>TREINO DE HOJE</small><h2>Peito + tríceps</h2><p>10 exercícios • aproximadamente 55 min</p></div><Dumbbell size={35}/></div><button><Play fill="currentColor" size={18}/> Iniciar treino</button></article>
      <div className="section-title"><div><h2>Seus exercícios</h2><p>Treino A • toque para concluir</p></div><span>{done.length}/3</span></div>
      <div className="exercise-list">{exercises.map((e,i)=><button key={e.name} className={done.includes(i)?"done":""} onClick={()=>setDone(d=>d.includes(i)?d.filter(x=>x!==i):[...d,i])}><span className="exercise-icon">{done.includes(i)?<Check/>:<Dumbbell/>}</span><span><b>{e.name}</b><small>{e.detail}</small><em>{e.last}</em></span><ChevronRight/></button>)}</div>
    </div><nav className="bottom-nav">{([[House,"Início"],[Dumbbell,"Treino"],[BarChart3,"Evolução"],[CalendarDays,"Aulas"]] as const).map(([Icon,label],i)=><button className={i===0?"current":""} key={label}><Icon size={22}/><span>{label}</span></button>)}</nav></section>}
  </main>;
}
function Stat({icon,label,value,change,warning=false}:{icon:React.ReactNode,label:string,value:string,change:string,warning?:boolean}){return <article className="stat"><div className={warning?"stat-icon warn":"stat-icon"}>{icon}</div><p>{label}</p><strong>{value}</strong><small className={warning?"warning":""}>{change}</small></article>}
function Money({label,value,color}:{label:string,value:string,color:string}){return <div className="money-row"><span><i className={color+"-dot"}/>{label}</span><b>{value}</b></div>}
