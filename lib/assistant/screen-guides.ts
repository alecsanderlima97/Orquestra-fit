// Roteiros da assistente virtual. Cada tela tem um texto curto e um áudio
// narrado (public/assistant/<id>.mp3). Mantenha texto e áudio sincronizados:
// se mudar um texto, gere o áudio de novo.

export type GuideRole = "gestao" | "professor" | "aluno";
export type ScreenGuide = { id: string; title: string; text: string };

const shared = {
  alunos: { id: "alunos", title: "Alunos", text: "Aqui ficam todos os alunos da academia. Use a busca e os filtros de programa, plano, mensalidade e situação para encontrar alguém rápido. Ao selecionar um aluno, você vê e edita o cadastro, a anamnese, os treinos e o histórico dele." },
  treinos: { id: "treinos", title: "Treinos", text: "Esta é a área de prescrição. Monte um programa por etapas, cadastre exercícios com máquina e GIF, salve modelos e publique a ficha para o aluno quando estiver pronta. Em cada exercício, o aluno pode ver o corpo em 3D com os músculos trabalhados." },
  aulas: { id: "aulas", title: "Aulas e reservas", text: "Em Aulas e reservas você cria turmas com professor, data, horário e número de vagas, e define quem pode reservar. Ao lado aparece a agenda da academia com as aulas e as reservas dos alunos." },
  avaliacoes: { id: "avaliacoes", title: "Avaliações", text: "Aqui você registra as avaliações físicas: peso, altura, gordura e medidas como cintura, peito, bíceps e coxa. O corpo anatômico ao lado mostra os pontos de medição. Depois, acompanhe a evolução do aluno no histórico." },
} satisfies Record<string, ScreenGuide>;

export const SCREEN_GUIDES: Record<GuideRole, Record<string, ScreenGuide>> = {
  gestao: {
    "Visão geral": { id: "gestao-visao-geral", title: "Visão geral", text: "Olá! Eu sou a assistente do Orquestra Fit e vou te mostrar cada tela. Esta é a visão geral da gestão: alunos ativos, receita prevista, mensalidades em aberto e a frequência de hoje. Logo abaixo ficam os alunos para acompanhar e os recebimentos do mês. Use o menu à esquerda para navegar." },
    Alunos: shared.alunos,
    Professores: { id: "professores", title: "Professores", text: "Em Professores você vê a equipe vinculada à academia, com contatos e status de acesso. Selecione um professor para visualizar ou editar o cadastro." },
    Financeiro: { id: "financeiro", title: "Financeiro", text: "O Financeiro reúne receita recebida, despesas pagas, resultado e dívida em aberto no período escolhido. Pelas abas você gerencia planos e mensalidades, contas a pagar, contas fixas, histórico e relatórios. Os avisos mostram o que vence nos próximos sete dias e o que já está vencido." },
    Estoque: { id: "estoque", title: "Estoque", text: "No Estoque você cadastra produtos, máquinas e itens de uso interno. Os saldos mudam somente por movimentações registradas. Pela venda rápida, você abre o ponto de venda do balcão, que dá baixa no estoque e registra no financeiro." },
    Treinos: shared.treinos,
    "Aulas e reservas": shared.aulas,
    Avaliações: shared.avaliacoes,
  },
  professor: {
    "Visão geral": { id: "professor-visao-geral", title: "Visão geral", text: "Olá, professor! Eu sou a assistente do Orquestra Fit. Nesta visão geral você acompanha seus alunos e o que precisa de atenção hoje. Pelo menu, acesse alunos, treinos, aulas e reservas e avaliações." },
    Alunos: shared.alunos,
    Treinos: shared.treinos,
    "Aulas e reservas": shared.aulas,
    Avaliações: shared.avaliacoes,
  },
  aluno: {
    inicio: { id: "aluno-inicio", title: "Início", text: "Olá! Que bom ter você aqui. Eu sou a assistente do Orquestra Fit. No início aparece o seu treino de hoje. Quando o professor liberar a ficha, é só tocar em começar. Use a barra de baixo para navegar entre as telas." },
    treinos: { id: "aluno-treinos", title: "Treinos", text: "Aqui estão os seus treinos. O programa atual mostra o próximo passo recomendado, mas você pode buscar e escolher outra ficha quando precisar. Em cada exercício, toque para ver o GIF e o corpo em 3D com os músculos trabalhados." },
    evolucao: { id: "aluno-evolucao", title: "Evolução", text: "Na evolução você acompanha seus treinos concluídos e o seu rank, aprovado pelo professor. Escolha o período de sete dias, trinta dias, três meses ou um ano para ver a sua consistência." },
    agenda: { id: "aluno-agenda", title: "Agenda", text: "Na agenda você vê o calendário do mês com as aulas da academia. Toque em um dia para ver os horários e reservar a sua vaga." },
    perfil: { id: "aluno-perfil", title: "Perfil", text: "No perfil ficam seus dados pessoais, a sua academia e o seu plano com as mensalidades. Você também pode alterar a sua foto por aqui." },
  },
};

export const GUIDE_STORAGE_KEY = "orquestra_fit_assistant_seen";

/** Telas que já têm narração gravada em public/assistant/<id>.mp3; as demais usam a voz do aparelho. */
export const GUIDE_AUDIO = new Set<string>([]);

export type ScreenAnnouncement = { role: GuideRole; screen: string };
let lastScreen: ScreenAnnouncement | null = null;
/** Informa à assistente qual tela está aberta (guarda a última para quem montar depois). */
export function announceScreen(detail: ScreenAnnouncement) {
  lastScreen = detail;
  window.dispatchEvent(new CustomEvent("orquestra-fit:screen", { detail }));
}
export function currentScreen() { return lastScreen; }
