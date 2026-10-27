# Nexo Assist

Login com cookie httpOnly, chamados em SQLite (`data/nexo.db`, fora do Git) e a máquina de atendimento com um agent falso. Ainda não há modelo nem as telas do protótipo.

## Rodar

```bash
npm install
copy .env.example .env
npm test
npm run typecheck
npm run dev
```

Defina `SESSION_SECRET` no `.env` antes do `npm run dev`. Qualquer senha não vazia entra para um e-mail do seed.

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

Outras frases do agent falso, ainda sem modelo:

- `A empresa inteira está parada` monta rascunho crítico e pausa o agent.
- `Quero falar com um analista` transfere.
- `Pode ver o notebook` encontra o INC-20311 vencido e transfere.
- `Não sei o que aconteceu` transfere por segurança baixa.
- `Isso é assunto de RH` não abre chamado.

Com o cookie do Rafael, na conversa que ficou `aguardando_analista`: `POST /api/conversations/{id}/return` devolve ao agent, `POST /api/conversations/{id}/assume` assume, e `POST /api/conversations/{id}/close` só encerra depois de assumir. Enquanto espera ou está em atendimento, a mensagem da Ana é gravada e o agent falso não é chamado.
