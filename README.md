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

Capturas reais do servidor em desenvolvimento, correspondentes aos cinco estados principais do Pen:

| Tela                             | Captura                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| Identificação                    | [login atualizado](docs/screenshots/login.png)                   |
| Chat · novo chamado              | [rascunho e confirmação](docs/screenshots/chat-funcionario.webp) |
| Chat · consulta e transferência  | [seleção de chamados](docs/screenshots/chat-consulta.webp)       |
| Atendente · conversas            | [fila e chamados](docs/screenshots/console-analista.webp)        |
| Atendente · atendimento assumido | [resposta humana](docs/screenshots/atendimento-assumido.webp)    |

A interface segue as dimensões, paleta, fontes, marca, composição e componentes inspecionados no arquivo Pen. O texto e os dados exibidos vêm do seed e dos fluxos reais, por isso podem diferir dos exemplos estáticos do protótipo. O painel de decisões e o aviso de modo demo acrescentam informações exigidas pelo desafio.

Na identificação, os ícones de e-mail e senha, a visualização da senha, o link de ajuda, a opção de manter a sessão e o rodapé de privacidade têm ações reais. Os três indicadores seguem os rótulos do Pen, mas mostram dados locais em vez dos números ilustrativos: tempo médio entre a primeira mensagem e a primeira resposta em conversas que não são apenas exemplos do seed; porcentagem de conversas encerradas sem analista, quando há amostra; e analistas com atividade nos últimos 60 segundos. `—` significa que ainda não há amostra. O link de privacidade explica o tratamento dos dados nesta demonstração.

| Papel       | E-mail                  | Senha                    |
| ----------- | ----------------------- | ------------------------ |
| Funcionária | `ana.paula@nexo.com`    | Qualquer texto não vazio |
| Funcionário | `bruno.lima@nexo.com`   | Qualquer texto não vazio |
| Analista    | `joao.martins@nexo.com` | Qualquer texto não vazio |

O seed é idempotente. O banco fica em `data/nexo.sqlite`, ignorado pelo Git. Para reiniciar os dados de demonstração, pare a aplicação, remova o arquivo SQLite e execute `pnpm setup`. O SQLite usa journal de rollback para manter as gravações estáveis durante reinícios do servidor de desenvolvimento.

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

O agente Mastra recebe o histórico recente persistido, inclusive de sessões anteriores, e pode usar ferramentas tipadas para consultar chamados do usuário autenticado e buscar artigos. Sua saída Zod descreve intenção, tipo, categoria, impacto, urgência e confiança. O backend recalcula prioridade e prazo e só executa alterações após confirmação por botão. Consultas e operações de chamado validam o proprietário no serviço, mesmo quando o modelo sugere um ID. O rascunho fica persistido no SQLite. Uma trava atômica impede confirmações concorrentes; criação usa chave de idempotência e detecção de duplicidade. Se há um chamado aberto semelhante, o rascunho propõe uma atualização confirmada. Erros do serviço mantêm o rascunho para nova tentativa.

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

O padrão é `openai/gpt-6-luna`, configurável por `MASTRA_MODEL`. Substitui o `gpt-4.1-mini`, que a [página de depreciações da OpenAI](https://developers.openai.com/api/docs/deprecations) marca como deprecated (desligamento em 14/01/2027, sucessor indicado: `gpt-6-luna`). É o modelo de menor custo da família atual (US$ 0,10 por 1 milhão de tokens de entrada e US$ 0,50 de saída, conforme a página de modelos em novembro de 2026), com suporte a ferramentas. A compatibilidade com a saída estruturada do Mastra ainda não foi exercitada com chave real neste repositório. Cada mensagem comum usa uma chamada de classificação, além de eventuais ferramentas locais. Confirmação, seleção de chamado e transferência explícita não chamam o modelo.

## Trade-offs e próximos passos

A autenticação é intencionalmente demonstrativa: usuários seed e qualquer senha não vazia. Em produção, seria substituída por SSO corporativo, com auditoria e limites de taxa. O SQLite simplifica a execução local e não foi projetado para múltiplas instâncias. As respostas aparecem após a decisão completa do modelo, sem streaming de tokens; a atualização entre funcionário e analista usa polling de 4 segundos. A busca da base de conhecimento usa palavras-chave, sem embeddings. A detecção de duplicidade é lexical. Uma próxima versão incluiria avaliação com conversas reais anonimizadas, calibração da confiança, busca semântica e métricas de SLA.

O caminho do LLM real (`DEMO_MODE=false`) ainda não foi executado com uma chave: os testes automatizados usam o modo demo. O modo de demonstração é limitado e identificado na interface.

## Referências

- [PRD e anexos](https://drive.google.com/file/d/1uhSgHcOvrx349nqsjuD1a4VToqOVv9b7/view)
- [Protótipo](https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg)
- [Ferramentas do Mastra](https://mastra.ai/docs/agents/tools)
- [Saída estruturada do Mastra](https://mastra.ai/docs/agents/structured-output)
