import type { Client } from "@libsql/client";

import { slaDueAt } from "../policy";

const DAY_MS = 24 * 60 * 60 * 1000;

type Employee = {
  id: string;
  name: string;
  email: string;
  role: "funcionario" | "analista";
  level: "N1" | "N2" | null;
};

const EMPLOYEES: Employee[] = [
  {
    id: "ana",
    name: "Ana Souza",
    email: "ana.souza@nexo.com.br",
    role: "funcionario",
    level: null,
  },
  {
    id: "bruno",
    name: "Bruno Tavares",
    email: "bruno.tavares@nexo.com.br",
    role: "funcionario",
    level: null,
  },
  {
    id: "carla",
    name: "Carla Mendes",
    email: "carla.mendes@nexo.com.br",
    role: "funcionario",
    level: null,
  },
  {
    id: "rafael",
    name: "Rafael Lima",
    email: "rafael.lima@nexo.com.br",
    role: "analista",
    level: "N2",
  },
];

const ARTICLES: Array<[string, string, string, string | null, string | null]> = [
  [
    "art-vpn-809",
    "VPN com erro 809",
    "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    "Rede e VPN",
    "somente Windows 10",
  ],
  [
    "art-horario",
    "Horário do service desk",
    "De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    null,
    null,
  ],
  [
    "art-sap",
    "Senha do SAP bloqueada",
    "Depois de três tentativas a senha bloqueia. Se o desbloqueio pelo portal não funcionar, abra um chamado de acesso.",
    "Acesso",
    null,
  ],
  [
    "art-outlook",
    "Outlook não sincroniza",
    "Feche o Outlook, confira a rede e abra de novo. No celular, remova a conta e adicione outra vez.",
    "E-mail",
    null,
  ],
  [
    "art-wifi",
    "Wi-Fi da Nexo",
    "A senha do Wi-Fi corporativo fica no portal de identidade. Não envie a senha por e-mail.",
    "Rede e VPN",
    null,
  ],
  [
    "art-portal",
    "Portal de softwares",
    "Programas aprovados são instalados pelo portal de softwares, sem precisar de chamado.",
    "Software",
    null,
  ],
  [
    "art-monitor",
    "Segundo monitor",
    "Pedido de monitor para home office é uma requisição de hardware, com prioridade baixa se não houver urgência.",
    "Hardware",
    null,
  ],
  [
    "art-sharepoint",
    "Acesso a pasta no SharePoint",
    "O acesso a uma pasta é pedido ao dono da área. Se o dono já aprovou e o acesso não chegou, abra um chamado.",
    "Acesso",
    null,
  ],
];

export async function seed(client: Client, now: Date): Promise<void> {
  const existing = await client.execute("SELECT COUNT(*) AS total FROM employees");
  const total = existing.rows[0]?.total;
  if (Number(total) > 0) {
    return;
  }

  const updatedSixDaysAgo = new Date(now.getTime() - 6 * DAY_MS);
  const updatedOneWeekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const resolvedFourDaysAgo = new Date(now.getTime() - 4 * DAY_MS);
  const resolvedFortyDaysAgo = new Date(now.getTime() - 40 * DAY_MS);
  const resolvedEightyDaysAgo = new Date(now.getTime() - 80 * DAY_MS);
  const updatedYesterday = new Date(now.getTime() - DAY_MS);

  const statements = [
    ...EMPLOYEES.map((employee) => ({
      sql: `INSERT INTO employees (id, name, email, role, level) VALUES (?, ?, ?, ?, ?)`,
      args: [employee.id, employee.name, employee.email, employee.role, employee.level],
    })),
    ...ARTICLES.map(([id, title, body, category, appliesWhen]) => ({
      sql: `INSERT INTO articles (id, title, body, category, applies_when) VALUES (?, ?, ?, ?, ?)`,
      args: [id, title, body, category, appliesWhen],
    })),
    ticketStatement({
      id: "INC-20311",
      ownerId: "ana",
      type: "INC",
      category: "Hardware",
      subjectDetail: "Notebook",
      impact: "pessoa",
      urgency: "ha_alternativa",
      priority: "media",
      title: "Notebook lento após atualização do Windows",
      description: "Lentidão geral desde a atualização do Windows. Reiniciar não resolveu.",
      status: "aguardando_analista",
      from: updatedSixDaysAgo,
      resolvedAt: null,
    }),
    ticketStatement({
      id: "REQ-10442",
      ownerId: "ana",
      type: "REQ",
      category: "Hardware",
      subjectDetail: null,
      impact: "pessoa",
      urgency: "sem_urgencia",
      priority: "baixa",
      title: "Segundo monitor para home office",
      description: "Pedido de um segundo monitor para o trabalho em casa.",
      status: "aprovado",
      from: updatedOneWeekAgo,
      resolvedAt: updatedOneWeekAgo,
    }),
    ticketStatement({
      id: "INC-20150",
      ownerId: "ana",
      type: "INC",
      category: "Acesso",
      subjectDetail: null,
      impact: "pessoa",
      urgency: "ha_alternativa",
      priority: "media",
      title: "Senha do SAP bloqueada",
      description: "A senha do SAP bloqueou depois de três tentativas.",
      status: "resolvido",
      from: resolvedFourDaysAgo,
      resolvedAt: resolvedFourDaysAgo,
    }),
    ticketStatement({
      id: "INC-20298",
      ownerId: "ana",
      type: "INC",
      category: "Acesso",
      subjectDetail: "SharePoint",
      impact: "pessoa",
      urgency: "ha_alternativa",
      priority: "media",
      title: "Acesso à pasta Financeiro no SharePoint",
      description: "A Ana não consegue abrir a pasta Financeiro no SharePoint.",
      status: "em_andamento",
      from: updatedYesterday,
      resolvedAt: null,
    }),
    ticketStatement({
      id: "INC-19877",
      ownerId: "ana",
      type: "INC",
      category: "E-mail",
      subjectDetail: null,
      impact: "pessoa",
      urgency: "ha_alternativa",
      priority: "media",
      title: "Outlook não sincroniza no celular",
      description: "O Outlook do celular parou de sincronizar e depois voltou.",
      status: "resolvido",
      from: resolvedFortyDaysAgo,
      resolvedAt: resolvedFortyDaysAgo,
    }),
    ticketStatement({
      id: "INC-19410",
      ownerId: "ana",
      type: "INC",
      category: "Acesso",
      subjectDetail: null,
      impact: "pessoa",
      urgency: "sem_urgencia",
      priority: "baixa",
      title: "Troca de senha da rede",
      description: "A senha da rede foi trocada pelo portal.",
      status: "resolvido",
      from: resolvedEightyDaysAgo,
      resolvedAt: resolvedEightyDaysAgo,
    }),
    ticketStatement({
      id: "INC-20400",
      ownerId: "bruno",
      type: "INC",
      category: "Rede e VPN",
      subjectDetail: null,
      impact: "pessoa",
      urgency: "impede_trabalho",
      priority: "alta",
      title: "VPN do Bruno não conecta",
      description: "Chamado do Bruno. A Ana não pode ver este registro.",
      status: "em_andamento",
      from: updatedYesterday,
      resolvedAt: null,
    }),
  ];

  await client.batch(statements, "write");
}

function ticketStatement(input: {
  id: string;
  ownerId: string;
  type: "INC" | "REQ";
  category: string;
  subjectDetail: string | null;
  impact: string;
  urgency: string;
  priority: "critica" | "alta" | "media" | "baixa";
  title: string;
  description: string;
  status: string;
  from: Date;
  resolvedAt: Date | null;
}) {
  return {
    sql: `INSERT INTO tickets (
      id, owner_id, type, category, subject_detail, impact, urgency, priority,
      title, description, status, sla_due_at, created_at, updated_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.ownerId,
      input.type,
      input.category,
      input.subjectDetail,
      input.impact,
      input.urgency,
      input.priority,
      input.title,
      input.description,
      input.status,
      slaDueAt(input.priority, input.from).toISOString(),
      input.from.toISOString(),
      input.from.toISOString(),
      input.resolvedAt?.toISOString() ?? null,
    ],
  };
}
