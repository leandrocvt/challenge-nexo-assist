# Nexo Assist

Login, chat, perfil e console seguem os frames do Pencil. Sem `OPENAI_API_KEY`, o chat usa o agent falso.

## Rodar

```bash
npm install
copy .env.example .env
npm test
npm run typecheck
npm run dev
```

`npm run eval` chama o modelo e fica fora do `npm test`. Ele exige `OPENAI_API_KEY` e o banco local com o seed. O modelo padrão é `openai/gpt-5-nano`, um modelo pequeno para a chamada estruturada e as duas tools de leitura. `NEXO_MODEL` troca o id no formato `provider/model`.

Cada chamada manda só as 6 falas mais recentes da conversa, mais a fala atual. Se houver mais, o modelo recebe a contagem do que ficou de fora, não o texto. Ficam de fora o rastro da decisão, o payload dos cards, avisos de sistema, a memória do Mastra, qualquer tool de escrita, o `employeeId` escolhido pelo modelo e as outras conversas. O teste de prioridade e prazo continua no `npm test`, sem rede. O eval cobre dúvida sem chamado, abertura com confirmação, duplicidade, reabertura, crítico, vencido, fora de TI e chamado alheio. A gravação do chamado continua na confirmação do rascunho, não nessa chamada.

```bash
npm run eval
```

Defina `SESSION_SECRET` no `.env` antes do `npm run dev`. Qualquer senha não vazia entra para um e-mail do seed. A Ana entra em `/atendimento`, o Rafael em `/console`. `POST /api/dev/falha` com `{ "mode": "before-commit" }` só existe fora de produção e faz a confirmação falhar sem gravar o chamado.

## Postman

Base `http://localhost:3000`. O cookie `nexo_session` fica httpOnly; o Postman guarda e reenvia sozinho.

`POST /api/login`

```json
{ "email": "ana.souza@nexo.com.br", "password": "qualquer", "remember": true }
```

A resposta traz a conversa. `GET /api/tickets` lista só os chamados desse funcionário. `GET /api/conversations/{id}` com o id de outra pessoa responde 404. Sem cookie, a lista responde 401.

O analista entra com `rafael.lima@nexo.com.br` e outra senha. `GET /api/tickets` é do funcionário e responde 403 para ele.

`POST /api/conversations/{id}/messages` com o cookie da Ana:

```json
{ "text": "Quero abrir um chamado de VPN" }
```

A resposta traz um rascunho e nenhum chamado novo. `POST /api/drafts/{id}/confirm` grava. Repetir a confirmação devolve o mesmo chamado.

Sem `OPENAI_API_KEY`, estas frases do agent falso ainda valem:

- `A empresa inteira está parada` monta rascunho crítico e pausa o agent.
- `Quero falar com um analista` transfere.
- `Pode ver o notebook` encontra o INC-20311 vencido e transfere.
- `Não sei o que aconteceu` transfere por segurança baixa.
- `Isso é assunto de RH` não abre chamado.

`GET /api/conversations` lista as conversas da Ana. `GET /api/conversations/{id}/messages` devolve o histórico com intenção, evidências, regra, ação e segurança.

Com o cookie do Rafael, `GET /api/console/conversations?filter=para_voce` mostra quem espera. Os filtros são `todas`, `para_voce`, `com_agent` e `minhas`. `q=INC-20311` acha a conversa da Ana e não o chamado do Bruno. `GET /api/conversations/{id}/tickets` lista só os chamados daquela pessoa.

`POST /api/conversations/{id}/return` devolve ao agent. `POST .../assume` assume. `POST .../replies` só responde depois de assumir e, com `ticketId`, reinicia o prazo daquele chamado. `POST .../close` só encerra depois de assumir. Na espera e no atendimento, a mensagem da Ana é gravada e o servidor não registra chamada ao modelo.
