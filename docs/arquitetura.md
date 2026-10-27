# Arquitetura — Nexo Assist

Este desenho separa três limites pedidos no PDF (p. 2): interface, agent e serviço de chamados. Autorização, confirmação, prioridade, SLA, duplicidade, reabertura, limite de mensagens e pausa do atendimento humano são funções do servidor. O prompt do agent orienta a conversa; ele não é a barreira.

A documentação consultada em 27 de outubro de 2026:

- Mastra: [createTool](https://mastra.ai/reference/tools/create-tool), [request context](https://mastra.ai/docs/server/request-context), [authentication and identity](https://mastra.ai/docs/guides/authentication-identity), [structured output](https://mastra.ai/docs/agents/structured-output), [migração VNext](https://mastra.ai/reference/migrations/vnext-to-standard-apis), [libSQL](https://mastra.ai/reference/storage/libsql), [adapter Next.js](https://mastra.ai/reference/server/next-adapter), [runEvals](https://mastra.ai/reference/evals/run-evals).
- Next.js: [serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages), [connection](https://nextjs.org/docs/app/api-reference/functions/connection).

## 1. Ajustes da stack

| Pedido | Ajuste | Por quê |
| --- | --- | --- |
| TypeScript estrito | `strict: true` no `tsconfig` | Exigido pelo PDF. **Sugestão:** ligar também `noUncheckedIndexedAccess`, para o acesso a listas ter tipo honesto. |
| Next.js | App Router e runtime Node.js nas rotas que tocam banco ou agent | O PDF sugere Next.js ou React. O runtime Edge não serve para SQLite nem para o cliente nativo do libSQL. |
| Mastra | Biblioteca chamada pelo nosso servidor, não a API genérica publicada pelo adapter | `@mastra/next` (`createNextRouteHandler`) expõe os recursos do Mastra. Um cliente poderia chamar o agent sem passar por sessão, confirmação e pausa. A própria doc de identidade diz que `RequestContext` personaliza a execução e não substitui a checagem de acesso no componente que toca o recurso. |
| Zod | Zod 4, importado de `zod` | O núcleo do Mastra deixou de aceitar Zod 3. `createTool` valida `inputSchema`. O mesmo esquema vale para a decisão, o contexto e os corpos HTTP. `output` e `experimental_output` estão depreciados; o contrato é `structuredOutput`. |
| SQLite | Arquivo local via `@libsql/client` | O store oficial é `LibSQLStore`, com `id` e `url` obrigatórios (`file:./arquivo.db`, ou `:memory:` no teste). O Next.js já deixa de empacotar `@libsql/client`, `libsql` e `better-sqlite3`. Ficamos no libSQL para não ter um segundo motor. `connection()` só entra se alguma função de servidor tocar o arquivo sem ler cookie ou header; rota que lê a sessão já é dinâmica. |
| Saída com tools | `structuredOutput.schema` em Zod e `errorStrategy: 'strict'` | Juntar tool e objeto estruturado depende do modelo, não é uma proibição do Mastra. Se o modelo escolhido não combina os dois, o caminho documentado é um segundo modelo em `structuredOutput.model`, `jsonPromptInjection: 'auto'` ou `prepareStep`. A etapa do agent escolhe um desses e registra no README. `strict` é o padrão e faz a chamada falhar em vez de mostrar decisão inválida. |

**Sugestão — um arquivo, dois donos.** `data/nexo.db` guarda o domínio (funcionários, artigos, chamados, conversas). Se precisarmos de traces do Mastra, `LibSQLStore` aponta para o mesmo arquivo absoluto, porque caminho relativo muda entre `next dev` e `mastra dev`. As tabelas do produto têm prefixo nosso e são criadas pela nossa migração. Não escrevemos nas tabelas `mastra_*`.

Arquivo local não sobrevive em função serverless sem disco. Isso só importa no diferencial de deploy.

## 2. Componentes

```text
Browser
  login, chat do funcionário, console do analista
        │  HTTP, cookie de sessão
        ▼
Next.js (runtime Node.js)
  rotas e ações de servidor
  valida cookie, Zod e estado da conversa
        │
        ├── Política pura
        │     prioridade, SLA, duplicidade, reabertura, escopo, limite
        │
        ├── Atendimento
        │     sessão de 30 mensagens, rascunho, transferência, pausa
        │
        ├── Agent Mastra
        │     lê ajuda e chamados; devolve decisão estruturada
        │
        └── Serviço de chamados
              consulta, cria, atualiza, transfere, falha transitória
                    │
                    ▼
              SQLite (libSQL) em data/nexo.db
```

| Módulo | Responsabilidade | Não faz |
| --- | --- | --- |
| Interface | Renderiza telas, opções, cards, rascunho, ações visíveis e detalhe da decisão. Mostra carregando e erro. | Não calcula SLA, não escolhe o funcionário e não chama o provedor de LLM. |
| Rotas | Autenticam, validam o corpo, aplicam o estado e devolvem o DTO. | Não embutem a regra do Anexo A em componentes. |
| Atendimento | Fonte da verdade da conversa: quem responde, rascunho pendente, contagem e resumo de transferência. | Não classifica prioridade por conta própria; chama a política. |
| Agent | Interpreta a fala, escolhe a próxima pergunta ou proposta, cita evidências e declara segurança. | Não grava chamado, não autentica e não decide sozinho que a conversa saiu da pausa. |
| Serviço de chamados | Única escrita de chamado. Isola por dono, aplica idempotência e simula indisponibilidade. | Não conversa com o modelo. |
| Central de ajuda | Artigos do seed, busca por texto. | Não é o sistema legado. É conteúdo local, como o Anexo B pede. |
| Política | Funções puras, sem banco e sem LLM. | Não lê sessão. |

A interface fala só com as rotas. As rotas falam com atendimento. Atendimento chama agent, política e serviço. O agent chama tools de leitura, que entram no serviço já com o id vindo do `RequestContext`.

## 3. Fluxo de uma mensagem do funcionário

1. A rota lê o cookie, carrega o funcionário e recusa papel errado ou conversa de outra pessoa.
2. O atendimento recusa a mensagem se a conversa está `aguardando_analista`, `em_atendimento` ou `encerrada`, ou se a sessão já tem 30 mensagens. Essa recusa acontece antes de qualquer chamada ao modelo.
3. Se existe rascunho pendente, um “sim” explícito não é interpretado pelo modelo como licença para gravar. A confirmação é outra rota, com o id do rascunho.
4. O servidor monta `RequestContext` com `employeeId` e `conversationId` e chama `agent.generate`. O agent também declara `requestContextSchema`: sem o id, o Mastra lança erro antes de chamar o modelo.
5. As tools de leitura usam esse id. Um argumento `employeeId` vindo do modelo é ignorado. A tool declara `requestContextSchema`. Se faltar o id, ela devolve um objeto de erro, não uma lista vazia. Lista vazia significaria “este funcionário não tem chamados”.
6. O objeto validado traz intenção, evidências, regra que o agent acredita aplicar, ação proposta, impacto, urgência, segurança e o texto para o funcionário.
7. O atendimento recalcula prioridade e prazo. Se a ação proposta contraria a política, a política vence e o detalhe registra a regra que venceu. Segurança `baixo`, criticidade, chamado vencido ou pedido de humano viram transferência.
8. Criar, atualizar ou reabrir apenas persiste um rascunho. A resposta mostra o rascunho e pede confirmação.
9. A resposta e o rastro são gravados na mesma unidade de trabalho. O processo pode cair depois disso sem perder a conversa.

Confirmação:

1. A rota confere sessão, dono, conversa e rascunho `pendente`.
2. Chama o serviço com a chave de idempotência do rascunho.
3. Indisponibilidade devolve erro recuperável e deixa o rascunho confirmável de novo, com a mesma chave.
4. Sucesso marca o rascunho como executado e devolve o card do chamado.

## 4. Contratos

Os esquemas Zod são a fronteira. Nomes finais podem ajustar na implementação; os campos abaixo são o contrato.

Decisão do agent (`structuredOutput.schema`):

- `intent`: `duvida`, `consulta`, `complemento`, `abertura`, `falar_com_analista`, `fora_de_ti`, `incerto`.
- `confidence`: `baixo`, `medio`, `alto`. O percentual da fila é derivado dessa faixa, como em `docs/requisitos.md`.
- `evidence`: lista de `{ source: 'artigo' | 'chamado', id, note }`.
- `rule`: identificador da regra do Anexo A que o agent usou, ou `nenhuma`.
- `proposedAction`: `responder`, `perguntar`, `propor_rascunho`, `transferir`, `redirecionar`.
- `impact`: `pessoa`, `equipe`, `empresa` ou nulo.
- `urgency`: `parado`, `impede_trabalho`, `compromisso_hoje`, `ha_alternativa`, `sem_urgencia` ou nulo.
- `draft`: título, descrição, tipo, categoria e chamado alvo, quando a ação for rascunho.
- `options`: até quatro rótulos curtos, quando a ação for perguntar.
- `reply`: texto para o funcionário.

`visibleActions` não entra nesse objeto. O servidor monta a lista a partir das tools que o `generate` registrou e da política que rodou. Os rótulos seguem o protótipo: “consultou seus chamados”, “buscou na central de ajuda”, “classificou a prioridade”, “consultou o SLA”, “montou o rascunho”, “calculou o prazo”.

Rastro persistido, ligado à mensagem do agent:

- intenção, evidências, regra aplicada pelo código, ação efetivada, segurança;
- prioridade calculada, prazo e a entrada que produziu os dois;
- id das tools e se alguma foi recusada pela política.

Tool de leitura de chamados:

- entrada do modelo: filtro opcional por texto ou número;
- contexto obrigatório: `employeeId` definido pelo servidor;
- saída: somente chamados daquele id, com `overdue` já calculado.

Não existe tool de criar ou atualizar chamado. O agent propõe; o atendimento grava o rascunho; o serviço só escreve na confirmação. Isso cobre o PDF, que pede o agent usando o serviço, sem entregar a escrita ao modelo.

Transferir chamado, no serviço, registra que aquele chamado foi para a fila humana. Transferir conversa, no atendimento, muda o estado e anexa o resumo. São operações diferentes. O PDF pede as duas: o serviço “transferir chamados” e a conversa “aguardando atendente”.

Corpos HTTP passam por Zod. Cookie ausente ou inválido responde 401. Conversa de outro funcionário responde 404, para não revelar que ela existe.

## 5. Modelo de dados

Um arquivo SQLite. Identificadores de chamado no formato do Anexo B: `INC-` e `REQ-` com cinco dígitos. Datas em UTC; a apresentação em `America/Sao_Paulo`.

`employees`

- `id`, `name`, `email` único, `role` (`funcionario` ou `analista`), `level` anulável (`N1` ou `N2`, só no analista).
- Sem senha gravada. **Hipótese:** qualquer senha não vazia serve para um e-mail do seed. “Manter conectado” só muda a duração do cookie.

`articles`

- `id`, `title`, `body`, `category` opcional, `constraint` opcional (exemplo: “somente Windows 10”).

`tickets`

- `id`, `owner_id`, `type`, `category`, `subject_detail` anulável, `impact`, `urgency`, `priority`, `title`, `description`;
- `status`: `em_andamento`, `aguardando_analista`, `em_atendimento`, `aprovado`, `resolvido`;
- `sla_due_at`, `created_at`, `updated_at`, `resolved_at`;
- `idempotency_key` única e anulável;
- `conversation_id` da origem, anulável.

`conversations`

- `id`, `employee_id`, `state`, `analyst_id` anulável;
- `active_session_id`, `transfer_summary`, `transfer_reason`;
- `created_at`, `updated_at`.

`sessions`

- `id`, `conversation_id`, `message_count`, `summary_of_previous`, `opened_at`, `closed_at`.
- A contagem é a trava das 30 mensagens.

`messages`

- `id`, `session_id`, `author` (`employee`, `agent`, `analyst`), `body`;
- `payload` com cards, opções ou rascunho;
- `created_at`, `counts_toward_limit`.

`decision_traces`

- `id`, `message_id`, e os campos do rastro da seção 4.

`drafts`

- `id`, `public_code` (o “Rascunho D-381” do frame), `conversation_id`, `employee_id`, `operation` (`create`, `update`, `reopen`);
- `payload`, `idempotency_key` única, `status` (`pending`, `executed`, `cancelled`);
- `ticket_id` depois da execução.

Não há tabela de status “vencido”. A consulta compara `sla_due_at` com o relógio.

## 6. Estados da conversa

```text
com_agent  -- transferência válida -->  aguardando_analista
aguardando_analista  -- assumir -->  em_atendimento
aguardando_analista  -- devolver -->  com_agent
em_atendimento  -- devolver -->  com_agent
em_atendimento  -- encerrar -->  encerrada
com_agent  -- conversa encerrada pelo fluxo -->  encerrada
```

| Estado | Quem pode falar | Agent |
| --- | --- | --- |
| `com_agent` | Funcionário | Pode ser chamado |
| `aguardando_analista` | Funcionário; a fala fica no histórico para o analista | Não é chamado |
| `em_atendimento` | Funcionário e analista | Não é chamado |
| `encerrada` | Ninguém nesta conversa | Não é chamado |

**Hipótese.** Enquanto espera ou é atendido, a mensagem do funcionário é aceita e conta no limite, mas não acorda o agent. O PDF diz que o agent para de responder; não diz que o chat trava.

Transição inválida responde erro de conflito. Assumir só vale em `aguardando_analista`. Devolver vale na espera e no atendimento, como os dois frames do console. Encerrar só vale em `em_atendimento`: o frame da espera não tem esse botão, e o compositor do analista fica desabilitado até ele assumir. Devolver grava uma orientação curta, quando o analista escreveu uma, no resumo que o agent verá na próxima fala.

Editar ou cancelar um rascunho `pendente` não chama o serviço de chamados. Editar recalcula prioridade e prazo e continua `pendente`.

O resumo de transferência, exigido pelo Anexo A, contém: o que o funcionário quer, chamados citados, última decisão, prioridade e o motivo (`pedido`, `critico`, `vencido`, `seguranca_baixa`).

## 7. Onde cada regra mora

| Regra | Onde é garantida |
| --- | --- |
| E-mail do seed e sessão | Rota de login e leitura do cookie em toda rota |
| Isolamento dos chamados | Repositório: toda leitura de funcionário exige `owner_id`. Não há método “listar todos” no caminho do chat |
| Confirmação | Escrita do serviço só é alcançada pela rota de confirmar rascunho |
| Prioridade e SLA | Funções puras chamadas pelo atendimento antes de gravar rascunho ou chamado |
| Duplicidade e reabertura | Serviço, na preparação do rascunho de criação |
| Transferência obrigatória | Atendimento, depois da decisão, com os quatro gatilhos do Anexo A |
| Pausa do agent | Atendimento, antes de `generate` |
| 30 mensagens | Atendimento, antes de `generate` e antes de aceitar fala do analista |
| Idempotência | Serviço, chave única na mesma transação da escrita |
| Visibilidade | Atendimento grava `decision_traces` para toda mensagem do agent |

O prompt repete essas regras para o modelo perguntar melhor e citar a evidência certa. Um teste que chama a política ou o serviço sem modelo precisa falhar se a regra for removida do código.

## 8. Testes e avaliação do agent

Três camadas, para a entrevista poder mudar uma regra e ver o teste quebrar:

- Política pura: cada linha de prioridade e prazo, inclusive sexta-feira à tarde atravessando o fim de semana, crítica de madrugada, e os limites de 7 dias e de 30 mensagens.
- Serviço e atendimento, com libSQL em memória ou arquivo temporário: isolamento, confirmação, idempotência com falha injetada, pausa e reinício da camada de dados.
- Decisões do agent, com `@mastra/evals` e `runEvals`, nos cenários de `docs/cenarios.md`. A trajetória esperada é “buscou artigos”, “buscou chamados” ou “não escreveu chamado”. Scorers de código verificam a ferramenta e a ação. Um scorer de código também recusa prioridade que discorde da função pura.

**Sugestão.** A suíte padrão não chama LLM, para rodar sem chave e sem custo. A avaliação do agent fica num comando separado, documentado no README, e usa o modelo escolhido. Nos testes do agent, o `RequestContext` é fixo; um cenário tenta pedir o chamado de outra pessoa e a tool não pode devolvê-lo.

## 9. Trade-offs

- **Política fora do prompt.** O modelo pode pedir uma ação ilegal e será corrigido. A conversa fica um pouco mais rígida e o comportamento fica explicável na entrevista.
- **Sem tool de escrita.** O agent não “abre o chamado” sozinho; ele propõe um rascunho. Perde-se a demonstração de uma tool mutável e ganha-se a confirmação mesmo quando o modelo ignora a instrução.
- **`generate` validado antes de pintar a resposta.** A API também faz streaming, e o objeto estruturado chega no fim. Os frames mostram a resposta pronta, com as ações acima. Esperar o objeto evita exibir texto que o esquema depois rejeitaria. Se a latência incomodar, o ajuste é de streaming, não de regra.
- **Histórico nosso, memória do Mastra desligada.** Duas memórias divergiriam do que o analista escreveu e do limite de 30. O servidor envia a janela recente da conversa em `generate`. O custo fica previsível. Perde-se working memory e semantic recall, que o problema não pede.
- **libSQL em arquivo.** Simples para o requisito de reinício local. Deploy serverless precisa de outro destino. Turso, citado na doc do `LibSQLStore`, é a continuação natural e não entra no núcleo.
- **Login didático.** Qualquer senha para e-mails do seed cumpre o PDF e não serve de exemplo de autenticação real. A sessão assinada ainda é do servidor, para o restante da segurança não ficar fake.
- **Fila única de analistas.** O frame mostra “Suporte N2” como crachá e como texto da transferência, não como segunda fila. O nível fica no cadastro do analista. A máquina de estados não muda.

## 10. O que a implementação não deve fazer

- Publicar `/api/mastra` ou qualquer rota em que o browser escolha `resource`, `thread` ou o id do funcionário.
- Aceitar prioridade, prazo ou dono do chamado como campos livres do cliente.
- Confiar numa frase “confirmado” dentro do prompt para gravar chamado.
- Contar o limite de 30 só na interface.
- Tratar o texto do modelo como prova de que uma tool rodou. O rastro visível sai das tools executadas e da regra que o código aplicou.
- Tratar carregamento, erro ou o detalhe expandido da decisão como se o Pencil os tivesse desenhado. As ações acima da resposta, sim, estão nos frames.
- Montar `createNextRouteHandler` de `@mastra/next`. Esse adapter publica `POST /api/agents/:id/generate`. Sem `server.auth`, a documentação avisa que as rotas do Mastra ficam públicas.
