# Nexo Assist

Login com cookie httpOnly e chamados em SQLite (`data/nexo.db`, fora do Git). Ainda não há agent nem as telas do protótipo.

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

O analista entra com `rafael.lima@nexo.com.br` e outra senha. Essa rota de chamados é do funcionário e responde 403 para ele.
