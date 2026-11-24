import { db } from "../src/lib/db";
import {
  users,
  tickets,
  articles,
  conversations,
  messages,
} from "../src/lib/schema";
import { dueAt } from "../src/lib/rules";
async function main() {
  const now = Date.now(),
    days = (n: number) => now - n * 86400000;
  for (const u of [
    {
      id: "u-ana",
      name: "Ana Paula",
      email: "ana.paula@nexo.com",
      role: "employee" as const,
    },
    {
      id: "u-bruno",
      name: "Bruno Lima",
      email: "bruno.lima@nexo.com",
      role: "employee" as const,
    },
    {
      id: "u-carla",
      name: "Carla Souza",
      email: "carla.souza@nexo.com",
      role: "employee" as const,
    },
    {
      id: "u-diego",
      name: "Diego Ramos",
      email: "diego.ramos@nexo.com",
      role: "employee" as const,
    },
    {
      id: "u-elisa",
      name: "Elisa Prado",
      email: "elisa.prado@nexo.com",
      role: "employee" as const,
    },
    {
      id: "u-fabio",
      name: "Fábio Nunes",
      email: "fabio.nunes@nexo.com",
      role: "employee" as const,
    },
    {
      id: "u-gabi",
      name: "Gabriela Rocha",
      email: "gabriela.rocha@nexo.com",
      role: "employee" as const,
    },
    {
      id: "a-joao",
      name: "João Martins",
      email: "joao.martins@nexo.com",
      role: "analyst" as const,
    },
    {
      id: "a-marina",
      name: "Marina Costa",
      email: "marina.costa@nexo.com",
      role: "analyst" as const,
    },
  ])
    await db.insert(users).values(u).onConflictDoNothing();
  const data = [
    [
      "INC-20311",
      "u-ana",
      "INC",
      "Notebook lento após atualização do Windows",
      "Hardware",
      "Média",
      "Aguardando analista",
      6,
      null,
    ],
    [
      "REQ-10442",
      "u-ana",
      "REQ",
      "Segundo monitor para home office",
      "Hardware",
      "Baixa",
      "Aprovado",
      7,
      null,
    ],
    [
      "INC-20150",
      "u-ana",
      "INC",
      "Senha do SAP bloqueada",
      "Acesso",
      "Média",
      "Resolvido",
      4,
      4,
    ],
    [
      "INC-20880",
      "u-bruno",
      "INC",
      "VPN não conecta erro 809",
      "Rede e VPN",
      "Alta",
      "Aberto",
      1,
      null,
    ],
    [
      "INC-20901",
      "u-carla",
      "INC",
      "E-mail sem sincronização",
      "E-mail",
      "Média",
      "Aberto",
      0,
      null,
    ],
  ] as const;
  for (const [
    id,
    ownerId,
    type,
    title,
    category,
    priority,
    status,
    age,
    resolved,
  ] of data) {
    const created = days(age + 1);
    await db
      .insert(tickets)
      .values({
        id,
        ownerId,
        type,
        title,
        description: title,
        category,
        impact: "pessoa",
        urgency: "normal",
        priority,
        status,
        dueAt: dueAt(new Date(created), priority).getTime(),
        resolvedAt: resolved === null ? null : days(resolved),
        createdAt: created,
        updatedAt: days(age),
      })
      .onConflictDoNothing();
  }
  const help = [
    [
      "vpn",
      "VPN com erro 809",
      "No Windows 10, reinstale o cliente de VPN pelo portal de softwares e reinicie. No Windows 11, abra um chamado.",
      "vpn 809 rede",
    ],
    [
      "horario",
      "Horário do service desk",
      "Atendimento de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
      "horario atendimento suporte",
    ],
    [
      "senha",
      "Redefinir senha corporativa",
      "Use o portal de identidade e confirme com o segundo fator. Se não tiver acesso, solicite apoio.",
      "senha acesso login",
    ],
    [
      "email",
      "E-mail sem sincronizar",
      "Verifique a conexão, reinicie o aplicativo e confira se a caixa está cheia.",
      "email outlook sincronizacao",
    ],
    [
      "wifi",
      "Conectar ao Wi-Fi corporativo",
      "Selecione Nexo-Corp, entre com suas credenciais corporativas e aceite o certificado.",
      "wifi rede conexao",
    ],
    [
      "software",
      "Instalar software aprovado",
      "Abra o portal de softwares e selecione o aplicativo aprovado. Para software novo, abra uma requisição.",
      "software instalar aplicativo",
    ],
    [
      "monitor",
      "Solicitar monitor",
      "Peça um monitor pelo service desk e informe local de entrega e justificativa.",
      "monitor hardware equipamento",
    ],
    [
      "mfa",
      "Problemas com autenticação em dois fatores",
      "Use um código de recuperação ou solicite redefinição do MFA ao service desk.",
      "mfa autenticacao token",
    ],
  ] as const;
  for (const [id, title, body, keywords] of help)
    await db
      .insert(articles)
      .values({ id, title, body, keywords })
      .onConflictDoNothing();
  const sampleConversations = [
    [
      "c-demo-bruno",
      "u-bruno",
      "waiting",
      null,
      "A VPN continua com erro 809. Preciso falar com um analista.",
      0,
    ],
    [
      "c-demo-carla",
      "u-carla",
      "analyst",
      "a-marina",
      "Meu e-mail não sincroniza desde ontem.",
      1,
    ],
    [
      "c-demo-diego",
      "u-diego",
      "agent",
      null,
      "Como instalo o software aprovado?",
      2,
    ],
    [
      "c-demo-elisa",
      "u-elisa",
      "waiting",
      null,
      "A equipe inteira ficou sem acesso à rede.",
      3,
    ],
    [
      "c-demo-fabio",
      "u-fabio",
      "closed",
      null,
      "Obrigado pelo atendimento.",
      4,
    ],
    [
      "c-demo-gabi",
      "u-gabi",
      "agent",
      null,
      "Preciso de acesso a uma pasta compartilhada.",
      5,
    ],
  ] as const;
  for (const [
    id,
    userId,
    status,
    analystId,
    body,
    minutes,
  ] of sampleConversations) {
    const timestamp = now - (minutes + 1) * 60000;
    await db
      .insert(conversations)
      .values({
        id,
        userId,
        status,
        analystId,
        draft: null,
        messageCount: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing();
    await db
      .insert(messages)
      .values({
        id: `m-${id}`,
        conversationId: id,
        sender: "employee",
        body,
        trace: null,
        createdAt: timestamp,
      })
      .onConflictDoNothing();
  }
  console.log("Seed concluído");
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
