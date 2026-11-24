# Nexo Assist

Agente de service desk de TI da Nexo. O funcionário descreve o problema no chat com as próprias palavras; o agente consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados (sempre com confirmação) e chama um analista quando precisa. Um console separado permite ao analista assumir, devolver e encerrar conversas.

Stack: Next.js 16 (App Router), TypeScript estrito, Mastra, SQLite + Drizzle, Vitest.

## Como rodar

Requer Node.js 22+ e pnpm 12+.

```bash
pnpm install
cp .env.example .env.local   # defina OPENAI_API_KEY
pnpm setup                   # cria data/nexo.sqlite com os dados de exemplo
pnpm dev                     # http://localhost:3000
```

| Variável                                 | Para que serve                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`                         | Chave do provedor. Fica só no servidor; nunca vai ao navegador nem ao Git.                                                                                                           |
| `MASTRA_MODEL`                           | Modelo do agente. Padrão `openai/gpt-6-luna`.                                                                                                                                        |
| `DEMO_MODE`                              | `true` usa uma classificação determinística, sem LLM, e a interface avisa. Serve para percorrer os fluxos sem chave; **a avaliação do agente deve ser feita com `DEMO_MODE=false`.** |
| `DATABASE_URL`                           | Arquivo SQLite. Padrão `./data/nexo.sqlite`.                                                                                                                                         |
| `LEGACY_FAILURE_RATE`, `LEGACY_DELAY_MS` | Simulam indisponibilidade e lentidão do sistema de chamados legado.                                                                                                                  |

Logins de exemplo (qualquer senha não vazia):

| Papel       | E-mail                  |
| ----------- | ----------------------- |
| Funcionária | `ana.paula@nexo.com`    |
| Funcionário | `bruno.lima@nexo.com`   |
| Analista    | `joao.martins@nexo.com` |

Há outros funcionários no seed (Carla, Diego, Elisa, Fábio, Gabriela). Para reiniciar os dados, pare o app, apague `data/nexo.sqlite` e rode `pnpm setup`. Conversas, chamados e o estado de cada conversa ficam no SQLite e sobrevivem a reinícios.

Roteiro rápido para avaliar (como Ana): "Minha VPN não conecta" → artigo da central de ajuda; "é Windows 11 e tenho entrega hoje" → o agente oferece abrir chamado e pergunta o que já foi tentado; responda pelos botões, confira o rascunho (tipo, prioridade, prazo) e confirme. Depois pergunte "Qual o status do chamado do Bruno Lima?" (recusa) e peça um analista; entre como João para ver o resumo e assumir.

## Telas

| Tela                                      | Captura                                                    |
| ----------------------------------------- | ---------------------------------------------------------- |
| Login                                     | [login](docs/screenshots/login.png)                        |
| Chat · pergunta com opções rápidas        | [perguntas](docs/screenshots/chat-perguntas.png)           |
| Chat · rascunho para confirmação          | [rascunho](docs/screenshots/chat-rascunho.png)             |
| Chat · chamado criado, com prazo          | [chamado criado](docs/screenshots/chat-chamado-criado.png) |
| Console · conversa transferida com resumo | [resumo](docs/screenshots/console-resumo.png)              |
| Console · analista atendendo              | [atendendo](docs/screenshots/console-atendendo.png)        |

Capturas reais do servidor com o LLM ativo. A interface segue o protótipo do Pen (dimensões, paleta, fontes e composição); textos e dados vêm do seed e dos fluxos reais, então diferem dos exemplos estáticos.

## Arquitetura

```text
src/components/          Interface: login, chat, cards, decisões e console do analista
src/app/api/             Rotas finas: sessão, chat, analista, métricas
src/lib/agent.ts         Agente Mastra, ferramentas de consulta e saída estruturada (Zod)
src/lib/conversation.ts  Orquestração: estados da conversa, rascunho, confirmação, transferência
src/lib/intake.ts        Título, descrição estruturada e formatação de prazo do chamado
src/lib/rules.ts         Prioridade, SLA, duplicidade, reabertura (funções puras)
src/lib/tickets.ts       Serviço de chamados simulado (o "legado"), independente do agente
src/lib/db.ts, schema.ts SQLite + Drizzle ORM
scripts/seed.ts          Funcionários, chamados em vários estados e 8 artigos
```

Decisões:

- **O modelo classifica; o backend decide e executa.** O LLM só devolve fatos tipados (intenção, tipo, categoria, impacto, urgência, confiança, campos do chamado). Prioridade, prazo, duplicidade, privacidade e confirmação são calculados em código determinístico e testável. O modelo nunca cria nem altera chamado.
- **Serviço de chamados separado do agente.** `tickets.ts` simula o sistema legado (falhas e atraso configuráveis, timeout de 3 s) e aplica o proprietário em toda operação, então mesmo um ID sugerido pelo modelo não alcança chamado de outra pessoa.
- **Conversa como máquina de estados** (`agent`, `waiting`, `analyst`, `closed`) persistida no SQLite. O rascunho pendente também é persistido, com trava atômica contra confirmações concorrentes e chave de idempotência na criação.
- **Interface sem estado de negócio.** O navegador consulta o servidor a cada 4 s (sem WebSocket) e confere a cada resposta qual usuário a sessão representa; se a sessão mudou em outra aba, a tela se reinicia para o usuário atual.

## Como o agente decide o que fazer

A cada mensagem de texto, `handleChat` monta o contexto (últimas 8 mensagens e o relato em andamento) e faz **uma** chamada ao agente Mastra, com saída estruturada validada por Zod. O agente pode usar duas ferramentas tipadas: `searchKnowledge` (central de ajuda) e `listTickets` (somente chamados do usuário autenticado). Confirmar, cancelar, selecionar chamado e "falar com analista" são botões e não chamam o modelo.

Com a decisão em mãos, o backend segue esta ordem:

1. **Transferência pedida** → resumo ao analista e agente pausado.
2. **Fora de TI** (RH, financeiro, facilities) → redireciona.
3. **Chamado de outra pessoa** (nome ou número que não é do usuário) → "Só posso informar chamados abertos por você."
4. **Confiança baixa** (< 0,55) → transfere ao analista com resumo.
5. **Consulta** → lista os chamados do usuário, com status e prazo; chamado vencido oferece/faz transferência.
6. **Dúvida** → resposta da central de ajuda, com a fonte. Se o usuário volta dizendo que não resolveu, informa o sistema operacional ou cita um prazo (caso do Anexo B: Windows 11), a intenção passa a ser abrir chamado.
7. **Abertura** → até duas perguntas com opções rápidas (o que já tentou, sistema operacional) e depois o rascunho: tipo INC/REQ, categoria, prioridade e prazo calculados no backend, título curto e descrição estruturada (problema, o que já tentou, SO, prazo, afetados). Se há chamado aberto do mesmo problema, o rascunho é uma **atualização**, não um novo chamado.
8. **Atualizar/reabrir** → exige chamado do próprio usuário; reabertura só até 7 dias após a resolução.

Prioridade (Anexo A): impacto de equipe/empresa → Crítica (1 h corrida, plantão 24 h, transfere na confirmação); compromisso hoje ou pessoa impedida → Alta (4 h úteis); alternativa disponível → Média (3 dias úteis); pedido sem urgência → Baixa (5 dias úteis). Horário útil: segunda a sexta, 8h–18h.

### Transparência

Cada resposta do agente grava em `messages.trace` o que ele entendeu (intenção, tipo, categoria, impacto, urgência), o que fez (ferramentas, resultados, regras aplicadas), a confiança, a justificativa objetiva, o tempo e os erros. Acima da resposta aparecem as ações em linguagem simples ("consultou seus chamados", "classificou a prioridade") e o botão **Detalhes** expande o registro completo. Não é o raciocínio interno do modelo, é um registro do que o sistema decidiu. A confiança é uma estimativa do modelo, não uma probabilidade calibrada.

### Transferência

O resumo vai como mensagem de sistema visível **só no console do analista**: motivo, chamado relacionado (se existir), problema descrito pelo funcionário (não o pedido de transferência), prioridade (só se já foi classificada) e o que já foi tentado. Enquanto a conversa está com um analista, mensagens do funcionário continuam no chat e o agente não responde.

## Como garanti a qualidade das decisões

- **Regras em código, com testes.** Vitest cobre prioridade e SLA (incluindo fim de semana), duplicidade (mesmo problema com outras palavras, problemas diferentes, chamado encerrado), reabertura em 7 dias, métricas, e os fluxos completos: criação só após confirmação, idempotência, privacidade entre usuários, transferência e pausa, limite de 30 mensagens, indisponibilidade do legado, pergunta ambígua, jornada do Anexo B (artigo → perguntas → rascunho → chamado), recusa de chamado alheio e conteúdo do resumo. Cada execução usa um SQLite isolado.
- **LLM exercitado com chave real.** Os testes automatizados usam o modo demo (determinístico) para serem repetíveis e gratuitos. O caminho com LLM (`DEMO_MODE=false`, `openai/gpt-6-luna`) foi percorrido manualmente nos casos do enunciado: artigo, "é Windows 11 e tenho entrega hoje", perguntas com opções, rascunho com tipo/prioridade/prazo, confirmação, recusa de chamado de outro funcionário, fora de escopo e transferência. Não há ainda uma suíte automatizada de avaliação do modelo (ver próximos passos).
- **Falhas previsíveis viram mensagens, não exceções.** Erro do legado ou do modelo gera resposta clara, preserva o rascunho e registra o erro no trace; nada é alterado sem confirmação.
- Validação local: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Segurança e privacidade

- Chave só em variável de ambiente (`.env.local` está no `.gitignore`).
- Chamados de um funcionário nunca chegam a outro: a verificação do proprietário está no serviço de chamados, não no prompt, e o usuário vem da sessão, nunca do corpo da requisição.
- Sessão por cookie `httpOnly`; novo login revoga a sessão anterior do navegador; respostas de sessão e dados usam `Cache-Control: no-store`.
- A autenticação é demonstrativa por definição do desafio (qualquer senha). Em produção seria SSO corporativo.

## Modelo, custo e eficiência

Padrão `openai/gpt-6-luna`, configurável por `MASTRA_MODEL`. Escolhi um modelo pequeno porque a tarefa é classificação com ferramentas e saída estruturada, em que latência e custo pesam mais que raciocínio longo. Ele substitui o `gpt-4.1-mini`, que a [página de depreciações da OpenAI](https://developers.openai.com/api/docs/deprecations) marca como deprecated (desligamento em 14/01/2027) com o `gpt-6-luna` como sucessor. Preço consultado em novembro de 2026: US$ 0,10 por 1 milhão de tokens de entrada e US$ 0,50 de saída, valor sujeito a mudança.

Uso consciente: no máximo **uma chamada ao modelo por mensagem de texto**, contexto limitado a 8 mensagens, nenhuma chamada em confirmações, seleções e transferências explícitas, consultas de chamado e busca de artigos feitas localmente, e limite de 30 mensagens por sessão.

## Principais trade-offs

- **Sem streaming de tokens.** A resposta aparece quando a decisão completa chega; em troca, a saída estruturada é validada antes de qualquer efeito. A atualização entre funcionário e analista é por polling de 4 s.
- **SQLite local.** Simples e persistente para rodar com poucos comandos, mas não serve para várias instâncias nem para o disco efêmero de plataformas serverless.
- **Busca da central de ajuda por palavras-chave**, sem embeddings. Suficiente para 8 artigos; limitada para sinônimos.
- **Duplicidade lexical** (radicais e sinônimos comuns), não semântica.
- **Perguntas dependem do modelo**: o backend limita a duas por relato e nunca bloqueia o rascunho por falta de detalhe técnico, para não frustrar o funcionário.
- **Sem limite de taxa nem auditoria** além do trace por mensagem.

## O que faria com mais tempo

- Suíte de avaliação do agente com conversas reais anonimizadas (acerto de intenção, tipo, prioridade e duplicidade), executada em CI contra o modelo, e calibração da confiança.
- Busca semântica na central de ajuda e detecção de duplicidade por embeddings.
- Streaming de respostas e WebSocket/SSE no lugar do polling.
- Banco gerenciado (Postgres) e SSO; limite de taxa por usuário e orçamento de tokens.
- Métricas de SLA e de resolução sem fila no console do analista.

## Deploy

Não publiquei o projeto. Para publicar em uma plataforma serverless seria preciso trocar o SQLite por um banco gerenciado, definir `OPENAI_API_KEY` e `MASTRA_MODEL` como variáveis de ambiente do provedor (não no repositório), e limitar o uso (limite de taxa por IP/usuário e teto de gasto no provedor do modelo) para evitar custo inesperado.

## Referências

- [PRD e anexos](https://drive.google.com/file/d/1uhSgHcOvrx349nqsjuD1a4VToqOVv9b7/view)
- [Protótipo](https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg)
- [Ferramentas do Mastra](https://mastra.ai/docs/agents/tools) · [Saída estruturada](https://mastra.ai/docs/agents/structured-output)
