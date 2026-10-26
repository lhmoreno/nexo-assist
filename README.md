# Nexo Assist

Agente de service desk de TI com chat para funcionários, painel de transparência e console de atendimento humano. Projeto local em Next.js, TypeScript, Mastra e SQLite.

## Executar

Requer Node.js 22+ e pnpm 12+.

```bash
pnpm install
cp .env.example .env.local
# Defina OPENAI_API_KEY em .env.local
pnpm setup
pnpm dev
```

Abra <http://localhost:3000>. Para avaliar sem uma chave, defina `DEMO_MODE=true` em `.env.local`. A interface indica claramente esse modo. Ele usa classificação determinística limitada e serve apenas para percorrer os fluxos; com uma chave, a classificação e a seleção de ferramentas são feitas pelo agente Mastra.

| Papel | E-mail | Senha |
| --- | --- | --- |
| Funcionária | `ana.paula@nexo.com` | Qualquer texto não vazio |
| Funcionário | `bruno.lima@nexo.com` | Qualquer texto não vazio |
| Analista | `joao.martins@nexo.com` | Qualquer texto não vazio |

O seed é idempotente. O banco fica em `data/nexo.sqlite`, ignorado pelo Git. Para reiniciar os dados de demonstração, pare a aplicação, remova o arquivo SQLite e execute `pnpm setup`.

## Arquitetura

```text
src/components/          Login, chat, cards, decisões e console
src/app/api/             Sessão, chat e operações do analista
src/lib/agent.ts         Agente Mastra, ferramentas de consulta e saída Zod
src/lib/conversation.ts  Orquestração da conversa, rascunhos e transferência
src/lib/tickets.ts       Serviço legado simulado, independente do agente
src/lib/rules.ts         Prioridade, SLA, duplicidade, reabertura
src/lib/db.ts            SQLite + Drizzle ORM
scripts/seed.ts          Usuários, chamados e 8 artigos
```

O agente Mastra recebe o histórico recente persistido, inclusive de sessões anteriores, e pode usar ferramentas tipadas para consultar chamados do usuário autenticado e buscar artigos. Sua saída Zod descreve intenção, tipo, categoria, impacto, urgência e confiança. O backend recalcula prioridade e prazo e só executa alterações após confirmação por botão. Consultas e operações de chamado validam o proprietário no serviço, mesmo quando o modelo sugere um ID. O rascunho fica persistido no SQLite. Uma trava atômica impede confirmações concorrentes; criação usa chave de idempotência e detecção de duplicidade. Erros do serviço mantêm o rascunho para nova tentativa.

Cada resposta do agente grava um registro de decisão em `messages.trace`: intenção, classificação, confiança, ferramentas, resultados, regras, justificativa objetiva, duração e erros. O painel acima da resposta mostra esse registro. Ele não contém pensamentos internos do modelo. A confiança é uma estimativa do modelo, não uma probabilidade calibrada; valores baixos encaminham ao analista.

A conversa passa pelos estados `agent`, `waiting`, `analyst` e `closed`. O analista pode assumir, responder, devolver ou encerrar. Enquanto um analista está responsável, mensagens do funcionário continuam no chat, mas o agente não responde. O navegador atualiza conversas a cada 4 segundos.

## Regras implementadas

- INC/REQ; categorias Acesso, Rede e VPN, Hardware, Software, E-mail e Outros.
- Crítica: 1 hora corrida, plantão 24h; Alta: 4 horas úteis; Média: 3 dias úteis; Baixa: 5 dias úteis. Horário útil: segunda a sexta, 8h–18h.
- Transferência solicitada, caso crítico, chamado vencido ou baixa confiança.
- Reabertura somente até 7 dias após a resolução.
- Confirmação explícita antes de criar, atualizar ou reabrir.
- Consulta e mutação restritas ao funcionário proprietário.
- Serviço legado com `LEGACY_FAILURE_RATE` e `LEGACY_DELAY_MS` para simular indisponibilidade e timeout de 3 segundos.

## Qualidade e validação

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Vitest cobre prioridade e SLA, duplicidade, confirmação, privacidade, transferência e pausa, reabertura, indisponibilidade e ambiguidade. Também foram percorridos no servidor local os fluxos de login, criação crítica, confirmação, transferência, resposta do analista e devolução.

## Modelo, custo e decisões

O padrão é `openai/gpt-4.1-mini`, configurável por `MASTRA_MODEL`. Foi escolhido por compatibilidade com ferramentas e saída estruturada e custo baixo para a triagem. Em outubro de 2026, a [página oficial do modelo](https://developers.openai.com/api/docs/models/gpt-4.1-mini) informa US$ 0,40 por 1 milhão de tokens de entrada e US$ 1,60 por 1 milhão de tokens de saída; preços e disponibilidade podem mudar. Cada mensagem comum usa uma chamada de classificação, além de eventuais ferramentas locais. Confirmação, seleção de chamado e transferência explícita não chamam o modelo.

## Trade-offs e próximos passos

A autenticação é intencionalmente demonstrativa: usuários seed e qualquer senha não vazia. Em produção, seria substituída por SSO corporativo, com auditoria e limites de taxa. O SQLite simplifica a execução local e não foi projetado para múltiplas instâncias. As respostas aparecem após a decisão completa do modelo, sem streaming de tokens; a atualização entre funcionário e analista usa polling de 4 segundos. A busca da base de conhecimento usa palavras-chave, sem embeddings. A detecção de duplicidade é lexical. Uma próxima versão incluiria avaliação com conversas reais anonimizadas, calibração da confiança, busca semântica e métricas de SLA.

Sem `OPENAI_API_KEY`, o fluxo real do LLM não pode ser exercitado. O modo de demonstração é limitado e identificado na interface. O projeto não inclui deploy nem repositório remoto.

## Referências

- [PRD e anexos](https://drive.google.com/file/d/1uhSgHcOvrx349nqsjuD1a4VToqOVv9b7/view)
- [Protótipo](https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg)
- [Ferramentas do Mastra](https://mastra.ai/docs/agents/tools)
- [Saída estruturada do Mastra](https://mastra.ai/docs/agents/structured-output)
