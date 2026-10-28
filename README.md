# Nexo Assist

Service desk de TI da Nexo. O funcionário conversa com o assistente, confirma um rascunho antes de qualquer chamado ser gravado, e um analista assume a conversa quando o agent pausa. A interface segue os seis frames do Pencil.

Três limites: a interface Next.js, o agent Mastra e o serviço de chamados. A tela só fala HTTP. Ela não abre o banco e não chama o modelo.

## Rodar

```bash
npm install
copy .env.example .env
npm test
npm run typecheck
npm run dev
```

No PowerShell, `copy` também serve. Em outro shell, use `cp .env.example .env`.

`SESSION_SECRET` precisa ter pelo menos 16 caracteres. A primeira subida cria `data/nexo.db`, aplica o esquema e carrega o seed. Não há comando separado de migração. Reiniciar o processo mantém o arquivo. A pasta `data/` não entra no git.

Abra `http://localhost:3000`. Qualquer senha não vazia entra para um e-mail do seed. E-mail fora do seed não entra.

| Pessoa | E-mail | Onde cai |
| --- | --- | --- |
| Ana Souza | `ana.souza@nexo.com.br` | `/atendimento` |
| Bruno Tavares | `bruno.tavares@nexo.com.br` | `/atendimento` |
| Carla Mendes | `carla.mendes@nexo.com.br` | `/atendimento` |
| Rafael Lima | `rafael.lima@nexo.com.br` | `/console` |

“Esqueci minha senha” e “Redefinir senha” não enviam e-mail. A senha de demonstração continua sendo qualquer uma.

Sem `OPENAI_API_KEY`, o chat usa um agent falso, com frases fixas, para o fluxo existir sem custo. Com a chave, o Mastra chama `openai/gpt-5-nano`. `NEXO_MODEL` troca o id no formato `provider/model`.

## Arquitetura

```text
Browser
  login, chat, perfil, console
        │  cookie httpOnly
        ▼
Rotas Next.js
  sessão, Zod, estado da conversa
        │
        ├── Política          prioridade, prazo, 30 mensagens, reabertura
        ├── Atendimento       rascunho, pausa, transferência, rastro
        ├── Agent Mastra      lê chamados e artigos; devolve uma decisão
        └── Serviço de chamados
                    │
                    ▼
              SQLite em data/nexo.db
```

O `employeeId` entra no `RequestContext` a partir da sessão. A tool de leitura ignora um funcionário escolhido pelo modelo. Não há tool de escrita e a API genérica do Mastra não é publicada.

## Como a decisão é tomada

1. A rota recusa papel errado, conversa de outra pessoa, conversa encerrada e a 31ª mensagem da sessão. Isso acontece antes do modelo.
2. Enquanto a conversa está com o analista, a fala é gravada e o modelo não é chamado.
3. A chamada manda só as 6 falas mais recentes, mais a fala atual. Se houver mais, o modelo recebe a contagem do que ficou de fora, não o texto. Ficam de fora o rastro, o payload dos cards, avisos de sistema, a memória do Mastra e as outras conversas.
4. O agent lê artigos e chamados daquele funcionário e devolve um objeto validado: intenção, evidências, ação proposta, impacto, urgência, segurança e o texto da resposta.
5. O código recalcula prioridade e prazo. Segurança baixa, pedido de analista, chamado vencido e caso crítico transferem. Assunto de RH, financeiro ou facilities não abre chamado. Um chamado de outra pessoa não é devolvido.
6. Criar, atualizar e reabrir só gravam um rascunho. O chamado nasce na confirmação, com chave de idempotência. Falha transitória não duplica.
7. Cada resposta do agent persiste as ações visíveis, a intenção, as evidências, a regra que venceu, a ação e a segurança. “Ver decisão” abre esse rastro.

## Como a qualidade é verificada

`npm test` não chama a rede. Cobre a tabela de prioridade e prazo, o isolamento dos chamados, a confirmação, a idempotência, a pausa, o limite de 30, a janela de 6 falas e o corretor dos cenários congelados.

`npm run eval` fica fora dessa suíte. Exige `OPENAI_API_KEY` e o banco local com o seed. Roda `runEvals` em oito cenários: dúvida sem chamado, abertura com confirmação, duplicidade, reabertura, crítico, vencido, fora de TI e chamado alheio. O corretor é código. Ele olha a ação, o rascunho e se a resposta vazou o chamado do Bruno. A gravação do chamado continua na confirmação do rascunho, não nessa chamada.

```bash
npm run eval
```

## Trade-offs

- A política fica no código. O modelo pode propor uma ação ilegal e o portão corrige. A conversa fica mais rígida e o motivo cabe numa regra nomeada.
- Sem tool de escrita, o agent não abre o chamado sozinho. A confirmação continua valendo mesmo se o texto disser que já gravou.
- A resposta espera o objeto estruturado, com `errorStrategy: strict`. Uma decisão inválida falha em vez de aparecer na tela. Os frames mostram a resposta pronta, com as ações acima.
- O histórico é o nosso. A memória do Mastra fica desligada para não divergir do que o analista escreveu nem do limite de 30.
- O login aceita qualquer senha dos e-mails de exemplo. A sessão assinada ainda é do servidor.
- O SQLite em arquivo sobrevive a um restart local. Sem disco persistente, o arquivo some com a instância.

## Com mais tempo

Publicar com o segredo fora do código, um teto de uso do modelo e o banco num disco que sobreviva ao restart da plataforma. O arquivo SQLite local não serve para função sem disco.

Se a espera da resposta estruturada incomodar, o ajuste é streaming. A regra de confirmação e o portão ficam onde estão.

## API

Base `http://localhost:3000`. O cookie `nexo_session` é httpOnly. O Postman reenvia sozinho.

`POST /api/login` com `{ "email": "ana.souza@nexo.com.br", "password": "qualquer", "remember": true }` abre a conversa. `GET /api/tickets` lista só os chamados dessa pessoa. Sem cookie, a lista responde 401. O chamado de outra pessoa responde 404. Para o Rafael, `GET /api/tickets` responde 403.

`POST /api/conversations/{id}/messages` com `{ "text": "Quero abrir um chamado de VPN" }` devolve um rascunho e nenhum chamado novo. `POST /api/drafts/{id}/confirm` grava. Repetir a confirmação devolve o mesmo chamado. `POST /api/dev/falha` com `{ "mode": "before-commit" }` só existe fora de produção e faz a confirmação falhar sem gravar.

Sem `OPENAI_API_KEY`, estas frases do agent falso ainda valem: `A empresa inteira está parada` monta rascunho crítico e pausa; `Quero falar com um analista` transfere; `Pode ver o notebook` encontra o INC-20311 vencido; `Não sei o que aconteceu` transfere por segurança baixa; `Isso é assunto de RH` não abre chamado.

`GET /api/conversations/{id}/messages` devolve o histórico com intenção, evidências, regra, ação e segurança.

Com o cookie do Rafael, `GET /api/console/conversations?filter=para_voce` mostra quem espera. Os filtros são `todas`, `para_voce`, `com_agent` e `minhas`. `q=INC-20311` acha a conversa da Ana. `POST /api/conversations/{id}/return` devolve ao agent. `POST .../assume` assume. `POST .../replies` só responde depois de assumir. `POST .../close` só encerra depois de assumir. Na espera e no atendimento, a mensagem do funcionário é gravada e o servidor não chama o modelo.
