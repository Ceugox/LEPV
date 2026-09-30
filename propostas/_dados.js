/* Dados de exemplo compartilhados pelas 5 propostas de UI.
   Espelham data/*.json (membros, empresas, roteiro, checklist) e completam o
   que hoje mora só no volume de produção (eventos, gastos, acessos). */
window.LEPV_DATA = {

  user: { name: "Clara Alencar", role: "Presidente", turma: "XVII", photo: "../_assets/members/3.png" },

  stats: [
    { k: "membros",  v: "11",      label: "Membros ativos" },
    { k: "turmas",   v: "XVII–XXX", label: "Turmas na liga" },
    { k: "empresas", v: "12",      label: "Empresas na rede" },
    { k: "imersao",  v: "1ª",      label: "Imersão · SP 2026" },
  ],

  mural: [
    { tipo: "aviso",    titulo: "Presença abre às 18h30 de quinta", texto: "O check-in da reunião de 01/10 abre automaticamente no dia. Cheguem 10 min antes — a presença fecha 15 min depois do início." },
    { tipo: "inscricao", titulo: "Visita à NOMAD — 4 vagas restantes", texto: "Inscrição até 03/10. Prioridade para quem não foi à imersão de julho." },
    { tipo: "aviso",    titulo: "Ata da assembleia no Arquivo", texto: "A ata de 24/09 já está disponível para consulta na aba Arquivo do acervo." },
  ],

  atividades: [
    "Reuniões semanais", "Aulas de valuation", "Visitas técnicas",
    "Imersões em empresas", "Happy hours", "Projetos internos",
    "Mentorias com alumni", "Competições de cases",
  ],

  eventos: [
    { id: "EVT-118", tipo: "reunião", titulo: "Reunião semanal — plano do 4º tri", data: "qui 01/10 · 19h00", local: "Sala 204, Bloco I, Praia Vermelha", inscricao: "aberta", vagas: null, presenca: "abre 01/10", codigo: "LIGA-7K2" },
    { id: "EVT-119", tipo: "visita",  titulo: "Visita técnica — NOMAD", data: "qua 07/10 · 14h00", local: "Av. Faria Lima, São Paulo", inscricao: "aberta", vagas: "4 de 12 restantes", presenca: "QR no dia", codigo: null },
    { id: "EVT-120", tipo: "social",  titulo: "Happy hour com alumni IME", data: "sex 09/10 · 19h30", local: "Pirajá, Faria Lima", inscricao: "aberta", vagas: null, presenca: "lista na porta", codigo: null },
    { id: "EVT-121", tipo: "aula",    titulo: "Aula 4 — Valuation por múltiplos", data: "sáb 10/10 · 10h00", local: "Sala 204 + transmissão", inscricao: "aberta", vagas: null, presenca: "abre 10/10", codigo: null },
    { id: "EVT-115", tipo: "aula",    titulo: "Aula 3 — Modelagem financeira", data: "sáb 26/09 · 10h00", local: "Sala 204, Bloco I", inscricao: "encerrada", vagas: null, presenca: "18 presentes", codigo: null },
    { id: "EVT-114", tipo: "reunião", titulo: "Reunião semanal + assembleia", data: "qui 24/09 · 19h00", local: "Sala 204, Bloco I", inscricao: "encerrada", vagas: null, presenca: "11 presentes", codigo: null },
  ],

  membros: [
    { nome: "Clara Alencar",          foto: "../_assets/members/3.png",  curso: "Engenharia da Computação",      ano: "4º ano", cargo: "Presidente",           turma: "XVII",   status: "ativa",   interesses: ["IA", "Tech"] },
    { nome: "Marcell Parra",          foto: "../_assets/members/1.png",  curso: "Engenharia da Computação",      ano: "4º ano", cargo: "Membro",               turma: "XVII",   status: "ativa",   interesses: ["IA", "Tech", "Mercado Financeiro"] },
    { nome: "Ludmila Ribeiro",        foto: "../_assets/members/5.png",  curso: "Engenharia Química",            ano: "3º ano", cargo: "Diretora de Pessoas",  turma: "XXVIII", status: "ativa",   interesses: ["Educação", "Química", "Esportes"] },
    { nome: "Ruan Pablo Rodrigues",   foto: "../_assets/members/6.png",  curso: "Engenharia da Computação",      ano: "4º ano", cargo: "Membro",               turma: "XVII",   status: "ativa",   interesses: ["IA", "Mercado Financeiro", "Infra"] },
    { nome: "Raimundo Costa Filho",   foto: "../_assets/members/4.png",  curso: "Engenharia Básico (Computação)",ano: "2º ano", cargo: "Diretor de Marketing", turma: "XXIX",   status: "reserva", interesses: ["IA", "Consultoria", "Mercado Financeiro"] },
    { nome: "Alexandro Souza Jr.",    foto: "../_assets/members/8.png",  curso: "Engenharia de Produção",        ano: "2º ano", cargo: "Membro",               turma: "XXIX",   status: "ativa",   interesses: ["IA", "Consultoria"] },
    { nome: "Pedro Teixeira",         foto: "../_assets/members/11.png", curso: "Engenharia Básico",             ano: "2º ano", cargo: "Membro",               turma: "XXIX",   status: "reserva", interesses: ["Tech", "Applied Math", "Venture Capital"] },
    { nome: "Plácido Tavares Gomes",  foto: "../_assets/members/2.png",  curso: "Engenharia Básico",             ano: "1º ano", cargo: "Membro",               turma: "XXX",    status: "reserva", interesses: ["Tech", "Fitness", "IA"] },
    { nome: "Fellipe Vieira",         foto: "../_assets/members/9.png",  curso: "Engenharia Básico",             ano: "1º ano", cargo: "Membro",               turma: "XXX",    status: "reserva", interesses: ["Mercado Financeiro", "Consultoria", "Tech"] },
    { nome: "Caroline Alves",         foto: "../_assets/members/7.png",  curso: "Engenharia Química",            ano: "1º ano", cargo: "Membro",               turma: "XXX",    status: "reserva", interesses: ["Educação", "Consultoria"] },
    { nome: "Ana Luisa Rozado",       foto: "../_assets/members/10.png", curso: "Engenharia Básico",             ano: "1º ano", cargo: "Membro",               turma: "XXX",    status: "reserva", interesses: ["IA", "Design"] },
  ],

  pendentes: [
    { nome: "João Marcos Vieira", meta: "Eng. Mecânica · 2º ano · indicado por Ruan" },
    { nome: "Beatriz Nogueira",   meta: "Eng. Química · 1º ano · formulario público" },
  ],

  visitantes: [
    { nome: "Turma de calouros XXX", quando: "reunião 24/09", tipo: "lista" },
    { nome: "Convidados Alumni IME", quando: "aula 26/09", tipo: "QR" },
  ],

  gastos: [
    { id: "G-041", dono: "Clara Alencar",   item: "Uber ida — NOMAD (4 pax)",           valor: "R$ 96,40",  data: "20/09", estado: "pago" },
    { id: "G-043", dono: "Ludmila Ribeiro", item: "Impressão material Aula 3 (60 un.)", valor: "R$ 84,00",  data: "25/09", estado: "aprovado" },
    { id: "G-044", dono: "Pedro Teixeira",  item: "Almoço equipe de organização",       valor: "R$ 212,90", data: "26/09", estado: "pendente" },
    { id: "G-045", dono: "Marcell Parra",   item: "Domínio lepv.org (renovação anual)", valor: "R$ 40,00",  data: "28/09", estado: "pendente" },
    { id: "G-039", dono: "Raimundo Filho",  item: "Adesivos para recepção de visita",   valor: "R$ 58,00",  data: "15/09", estado: "recusado", motivo: "Sem nota fiscal anexada" },
  ],

  diretoria: [
    { data: "seg 05/10", titulo: "Insper — parceria cursos 2027",         obs: "Retorno da conversa de julho; levar proposta de trilha" },
    { data: "qua 14/10", titulo: "Alumni IME — conselho consultivo",      obs: "Convite p/ banca de mentores do 1º tri" },
    { data: "sex 23/10", titulo: "Escritório Mottu — janela de visita",   obs: "Confirmar headcount até 16/10" },
  ],

  acessos: [
    { membro: "Clara Alencar",        papel: "diretoria", ultimo: "hoje 08:41",      sessoes7d: 14, origem: "187.44.x.x" },
    { membro: "Marcell Parra",        papel: "super",     ultimo: "ontem 23:12",     sessoes7d: 21, origem: "201.17.x.x" },
    { membro: "Ludmila Ribeiro",      papel: "diretoria", ultimo: "ontem 19:03",     sessoes7d: 6,  origem: "177.92.x.x" },
    { membro: "Ruan Pablo Rodrigues", papel: "membro",    ultimo: "28/09 22:40",     sessoes7d: 4,  origem: "189.60.x.x" },
    { membro: "Pedro Teixeira",       papel: "membro",    ultimo: "27/09 15:22",     sessoes7d: 2,  origem: "201.17.x.x" },
  ],

  empresas: [
    { key: "nomad",   nome: "NOMAD",          cor: "#FFCE00", logo: "../_assets/logos/nomad.svg",   dia: "20/07", blurb: "Conta internacional em dólar e investimentos no mercado americano para clientes no Brasil." },
    { key: "mottu",   nome: "Mottu",          cor: "#00B131", logo: "../_assets/logos/mottu.svg",   dia: "21/07", blurb: "Aluguel de motocicletas por assinatura para entregadores, em 170+ cidades." },
    { key: "insper",  nome: "Insper",         cor: "#C4161C", logo: "../_assets/logos/insper.png",  dia: "21/07", blurb: "Instituição de ensino e pesquisa referência em negócios e economia." },
    { key: "mirow",   nome: "Mirow & Co.",    cor: "#00ABFF", logo: "../_assets/logos/mirow.svg",   logoBg: "dark", dia: "22/07", blurb: "Consultoria de estratégia, inovação e market intelligence." },
    { key: "sharpi",  nome: "Sharpi",         cor: "#4A2DF6", logo: "../_assets/logos/sharpi.png",  dia: "22/07", blurb: "Vendas com IA para indústrias e distribuidoras." },
    { key: "bain",    nome: "Bain & Company", cor: "#CB2026", logo: "../_assets/logos/bain.svg",    dia: "22/07", blurb: "Consultoria de estratégia global, fundada em Boston em 1973." },
    { key: "revolut", nome: "Revolut",        cor: "#4F55F1", logo: "../_assets/logos/revolut.svg", dia: "23/07", blurb: "Fintech global: conta multimoeda, câmbio e investimentos." },
    { key: "segura",  nome: "Segura",         cor: "#09402D", logo: "../_assets/logos/segura.png",  dia: "23/07", blurb: "Insurtech que conecta corretores e seguradoras via plataforma." },
    { key: "link",    nome: "Link",           cor: "#072041", logo: "../_assets/logos/link.png",    dia: "23/07", blurb: "Faculdade dedicada a empreendedorismo, com campus em Miami." },
    { key: "pax",     nome: "PAX",            cor: "#E2FF62", logo: "../_assets/logos/pax.svg",     logoBg: "dark", dia: "24/07", blurb: "IA para segurança pública: unifica câmeras de vigilância em uma rede." },
    { key: "enter",   nome: "ENTER",          cor: "#FFAE35", logo: "../_assets/logos/enter.svg",   dia: "24/07", blurb: "Legaltech de IA que automatiza contencioso de massa." },
    { key: "tivita",  nome: "Tivita",         cor: "#0F1E1B", logo: "../_assets/logos/tivita.svg",  dia: "24/07", blurb: "Gestão de clínicas e consultórios — healthtech fundada em 2023." },
  ],

  empresaDetalhe: {
    key: "nomad", nome: "NOMAD", dia: "Segunda 20/07 · 10h00–17h00",
    endereco: "Av. Brig. Faria Lima, São Paulo",
    aprendizados: [
      "Operação de câmbio vive de compliance: cada feature nasce com o jurídico na mesa.",
      "Times de produto pequenos (4–6) com autonomia total de roadmap.",
      "Onboarding de cliente tratado como produto, com métrica de ativação semanal.",
    ],
    materiais: [
      { nome: "Deck — jornada do cliente internacional.pdf", tipo: "pdf", tamanho: "4,2 MB" },
      { nome: "Notas da visita — Ludmila.md", tipo: "nota", tamanho: "12 KB" },
      { nome: "Fotos da visita (18)", tipo: "link", tamanho: "Drive" },
    ],
    perguntas: [
      "Como decidem o que entra no roadmap trimestral?",
      "Qual o SLA interno entre compliance e produto?",
      "Como medem ativação no primeiro mês?",
    ],
  },

  selos: [
    { nome: "Pioneiro",        desc: "Participou da 1ª Imersão em SP",    qtd: 11, icone: "✦" },
    { nome: "Presença cheia",  desc: "100% de presença nas 12 visitas",   qtd: 9,  icone: "◎" },
    { nome: "Relator",         desc: "Escreveu o registro oficial de uma visita", qtd: 12, icone: "✎" },
    { nome: "Anfitrião",       desc: "Recebeu uma empresa em nome da liga", qtd: 4, icone: "◈" },
    { nome: "Liga das turmas", desc: "Integrou 2+ turmas na mesma imersão", qtd: 11, icone: "∴" },
  ],

  roteiro: {
    hotel: { nome: "Iguatemi Stay BT", endereco: "R. Butantã, 324 — Pinheiros, São Paulo" },
    quartos: [
      { label: "Quarto 1 · 4 pessoas", membros: ["Ruan Pablo Rodrigues", "Marcell Parra", "Raimundo Costa Filho", "Plácido Tavares Gomes"] },
      { label: "Quarto 2 · 7 pessoas", membros: ["Clara Alencar", "Ludmila Ribeiro", "Caroline Alves", "Ana Luisa Rozado", "Fellipe Vieira", "Alexandro Souza Jr.", "Pedro Teixeira"] },
    ],
    dias: [
      { id: "dom19", dia: "Domingo 19/07", nota: "Chegada + check-in. Sem visitas.", paradas: ["Check-in no hotel", "Jantar de abertura — Vila Madalena"] },
      { id: "seg20", dia: "Segunda 20/07", nota: "NOMAD em período quase integral. À noite, happy hour Alumni IME no Pirajá.", paradas: ["10:00–17:00 · NOMAD", "19:30 · Happy hour Alumni IME — Pirajá"] },
      { id: "ter21", dia: "Terça 21/07",   nota: "Duas visitas: mobilidade de manhã, educação à tarde.", paradas: ["09:30 · Mottu — Vila Ribeiro de Barros", "14:00 · Insper — Vila Olímpia"] },
      { id: "qua22", dia: "Quarta 22/07",  nota: "Dia de consultorias e IA comercial.", paradas: ["09:00 · Mirow & Co.", "13:30 · Sharpi", "16:30 · Bain & Company"] },
      { id: "qui23", dia: "Quinta 23/07",  nota: "Fintechs globais e educação empreendedora.", paradas: ["09:30 · Revolut", "13:00 · Segura", "15:30 · Link"] },
      { id: "sex24", dia: "Sexta 24/07",   nota: "Último dia: IA aplicada e fechamento.", paradas: ["09:00 · PAX", "11:30 · ENTER", "14:30 · Tivita", "18:00 · Fechamento + voo de volta"] },
    ],
  },

  missao: {
    titulo: "De 19 a 24/07/2026",
    resumo: "A LEPV levou 11 membros a São Paulo para uma imersão em empresas de tecnologia, mobilidade, educação e consultoria. O objetivo: entender de perto como fintechs, startups e grandes consultorias operam no dia a dia — cultura, processos e decisões — e trazer esse repertório de volta para a liga.",
    objetivos: [
      "Visitar 12 empresas em 5 dias de agenda cheia",
      "Construir repertório prático sobre operação, cultura e crescimento",
      "Fortalecer a rede de contatos da liga em São Paulo",
      "Trazer aprendizados concretos para os projetos internos",
    ],
    pioneiros: [
      { titulo: "Um espectro raro", texto: "De healthtech a consultoria global: a agenda cobriu empresas em estágios e culturas muito diferentes — de times de 15 pessoas a operações com milhares." },
      { titulo: "Repertório, não turismo", texto: "Cada visita teve relator designado, perguntas preparadas e registro publicado no acervo — o material fica para as próximas turmas." },
      { titulo: "A ponte RJ–SP", texto: "A imersão criou a primeira rede estável da liga fora do campus: anfitriões, alumni e contatos que já respondem por novas visitas." },
    ],
  },

  arquivo: {
    trajetos: [
      { dia: "Seg 20/07", perna: "Hotel → NOMAD", modo: "Uber 4+4+3", tempo: "35 min" },
      { dia: "Seg 20/07", perna: "NOMAD → Pirajá", modo: "A pé", tempo: "12 min" },
      { dia: "Ter 21/07", perna: "Hotel → Mottu", modo: "Uber 4+4+3", tempo: "28 min" },
      { dia: "Ter 21/07", perna: "Mottu → Insper", modo: "Uber 4+4+3", tempo: "40 min" },
      { dia: "Qua 22/07", perna: "Sharpi → Bain", modo: "Metrô L4→L2", tempo: "45 min" },
    ],
    checklist: [
      { texto: "Confirmar endereço exato de cada visita com o anfitrião", feito: true },
      { texto: "Combinar ponto de encontro no lobby 15 min antes de cada saída", feito: true },
      { texto: "Pedir Ubers/99 em grupo com antecedência nos horários de pico", feito: true },
      { texto: "Relator designado por visita + registro publicado em 48h", feito: true },
      { texto: "Reserva de emergência do grupo centralizada na tesouraria", feito: false },
    ],
  },

  legado: [
    { titulo: "O que a imersão deixou", texto: "Uma rede de 12 anfitriões em SP, um método de visita (preparo → pergunta → registro → repasse) e o primeiro acervo consultável da liga. Tudo que era operação da semana virou referência permanente." },
    { titulo: "O que muda na próxima", texto: "Reservar janela maior entre visitas no mesmo dia, consolidar o transporte em um único fornecedor e abrir inscrição por sorteio ponderado por presença." },
  ],
};
