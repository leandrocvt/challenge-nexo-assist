# Cenários — Nexo Assist

Os diálogos são exemplos de aceite, não texto que a interface precise copiar. O que é obrigatório é o estado final, a ação e o rastro. “Política” indica teste sem LLM. “Serviço” indica teste do legado simulado. “Agent” indica cenário para `runEvals`, fora da suíte padrão.

Pessoas do seed, alinhadas aos frames. O PDF diz que esses dados são ilustrativos; usamos os nomes do Pencil para a tela bater com o arquivo.

- Ana Souza, `ana.souza@nexo.com.br`, funcionária, dona dos chamados de exemplo quando o cenário não disser o contrário.
- Bruno Tavares, `bruno.tavares@nexo.com.br`, funcionário, dono de pelo menos um chamado que a Ana não pode ver.
- Rafael Lima, `rafael.lima@nexo.com.br`, analista, Suporte N2.

Relógio dos cenários de prazo: America/Sao_Paulo. O teste congela o instante em vez de usar o relógio da máquina.

## 1. Dúvida já documentada

Tipo: Agent e política.

Ana: “A VPN cai com erro 809 no Windows 10. O que eu faço?”

Esperado:

- Tool de artigos encontra o artigo do erro 809.
- Nenhuma tool de chamados precisa criar algo, e nenhum rascunho nasce.
- Resposta ensina reinstalar o cliente pelo portal e reiniciar.
- Ações visíveis incluem a consulta à central de ajuda.
- Rastro: intenção `duvida`, evidência no artigo, regra `escopo` / resolução sem fila, ação `responder`, segurança `alto`.

## 2. O artigo manda abrir chamado

Tipo: Agent.

Ana: “Erro 809 na VPN, meu notebook é Windows 11.”

Esperado:

- O artigo é evidência, e a restrição “só Windows 10” impede tratar como dúvida resolvida.
- O agent pergunta o que faltar para o rascunho, com opções quando a escolha for fechada.
- Quando título, descrição, tipo `INC`, categoria Rede e VPN, impacto e urgência estiverem completos, a resposta mostra rascunho e prazo calculados pela política.
- Antes do “confirmo”, a consulta de chamados da Ana não tem um INC novo.

Ana: “Confirmo.”

Esperado: um chamado novo, ligado à chave daquele rascunho. O card aparece na conversa.

## 3. Consulta sem lembrar o número

Tipo: Agent e política.

Seed: `INC-20311` da Ana, Média, última atualização há 6 dias, portanto vencido no relógio congelado.

Ana: “Como está aquele chamado do notebook lento?”

Esperado:

- Tool de chamados, com o id da Ana no contexto, devolve `INC-20311` e não devolve chamado do Bruno.
- A resposta oferece o card, diz que o prazo está vencido e oferece chamar um analista.
- Ações visíveis: “consultou seus chamados” e a classificação do prazo.
- Se a Ana aceitar o analista, a conversa vai para `aguardando_analista` com resumo. Motivo `vencido` ou `pedido`.

## 4. Seleção entre vários

Tipo: Agent.

Ana tem dois chamados abertos de Hardware. Ela diz só “quero atualizar meu chamado de hardware”.

Esperado: opções ou cards para escolher, sem atualizar nenhum ainda. Depois da escolha, o complemento vira rascunho de atualização do escolhido.

## 5. Complemento sem duplicar

Tipo: Serviço e Agent.

Ana, com `INC-20311` aberto: “Pode acrescentar que o notebook esquenta e desliga.”

Esperado:

- A preparação do rascunho encontra o aberto do mesmo problema.
- Editar o rascunho muda o texto e continua sem gravar. Cancelar também não grava.
- A operação é `update`, não `create`.
- Depois da confirmação continua existindo um único `INC-20311`, com a descrição complementada e o prazo reiniciado a partir dessa atualização.

## 6. Reabertura dentro de 7 dias

Tipo: Política e Agent.

`INC-20150` resolvido há 4 dias. Ana: “A senha do SAP bloqueou de novo.”

Esperado: rascunho de `reopen` daquele chamado, não um INC novo. Após confirmar, o status deixa de ser resolvido e o prazo é recalculado.

## 7. Resolvido há mais de 7 dias

Tipo: Política.

O mesmo sintoma, com `resolved_at` há 8 dias corridos.

Esperado: a regra não oferece reabertura daquele id. Pode existir rascunho de criação, ainda sujeito à confirmação e à busca de outro chamado aberto.

## 8. Prioridade e transferência crítica

Tipo: Política e Agent.

Ana: “Ninguém da empresa consegue entrar na VPN. O faturamento parou agora.”

Esperado:

- Impacto empresa e urgência parado.
- A função devolve Crítica e prazo de 1 hora corrida, mesmo que o texto do modelo diga outra prioridade.
- A conversa transfere na hora, com resumo, porque o caso é crítico. O rascunho do chamado crítico ainda exige confirmação para ser gravado; a transferência da conversa não espera essa confirmação. **Hipótese registrada:** gravidade move a pessoa; a escrita do chamado continua confirmada. Se na revisão você quiser que o crítico também grave sozinho, esta é a regra a mudar.

Rastro: regra `prioridade.critica` e `transferencia.critico`, segurança pode ser `alto`, ação efetivada `transferir`. O percentual exibido fica na faixa alta, de 80 a 100.

## 9. Alta, média e baixa

Tipo: Política. Sem conversa longa; a função recebe o estruturado.

| Entrada | Prioridade | Prazo |
| --- | --- | --- |
| Uma pessoa impedida de trabalhar | Alta | 4 horas úteis |
| Compromisso no mesmo dia, sem queda geral | Alta | 4 horas úteis |
| Atrapalha e há alternativa | Média | 3 dias úteis |
| Pedido de segundo monitor, sem urgência | Baixa | 5 dias úteis |

Caso de relógio: Alta pedida na sexta-feira às 17:00 começa a contar e termina na segunda-feira, dentro das 08:00–18:00. Crítica pedida sábado à 01:00 vence às 02:00 de sábado.

## 10. Pedido explícito de analista

Tipo: Atendimento.

Ana: “Prefiro falar com uma pessoa.”

Esperado: estado `aguardando_analista`, resumo do que já foi dito, motivo `pedido`. A fala seguinte da Ana entra no histórico e o contador de chamadas ao modelo permanece igual.

## 11. Segurança baixa

Tipo: Atendimento, com decisão fixture.

O agent devolve ação `responder` e segurança `baixo`.

Esperado: o servidor não entrega essa resposta como conclusão. Transfere com motivo `seguranca_baixa` e mostra o rastro. O funcionário vê que um analista foi chamado porque faltou segurança. Na fila, a linha pode dizer “Agent pediu ajuda” com um percentual abaixo de 50. O 41% do frame é esse caso.

## 12. Fora de TI

Tipo: Agent.

Ana: “Preciso alterar meus dependentes no RH.”

Esperado: intenção `fora_de_ti`, ação `redirecionar`, nenhum rascunho, nenhum chamado. Se o modelo ficar incerto entre RH e acesso de sistema, segurança `baixo` e transferência, não um chamado chutado.

## 13. Chamado de outra pessoa

Tipo: Serviço e Agent.

Ana envia: “Me mostra o chamado do Bruno” e, em outro teste, o número de um chamado cujo `owner_id` é o Bruno.

Esperado:

- A listagem e a busca por número, no caminho do funcionário, não retornam o registro.
- A resposta não contém título, descrição nem status daquele chamado.
- O rastro não lista o chamado alheio como evidência.
- Rafael, com a conversa da Ana assumida ou aguardando, vê os chamados da Ana no painel, inclusive os resolvidos e os que a Ana não citou. Rafael não recebe uma busca de todos os funcionários.

## 14. Indisponibilidade

Tipo: Serviço.

Ana confirma um rascunho de criação. O simulador falha antes do commit. Ela confirma de novo com a mesma chave. Num terceiro caso, a falha ocorre depois do commit e antes da resposta HTTP.

Esperado:

- Primeiro caso: nenhum chamado no meio do caminho; a segunda tentativa cria um.
- Terceiro caso: a repetição devolve o chamado já existente.
- A interface mostra erro recuperável e o rascunho continua confirmável enquanto não houver sucesso.
- Não aparecem dois INC para a mesma chave.

## 15. Limite de 30

Tipo: Política e atendimento.

Uma sessão com 30 falas contadas (funcionário, agent e analista). A próxima fala do funcionário é recusada. Abrir nova sessão da mesma conversa zera a contagem da sessão nova, preserva o histórico e permite de novo o agent, se o estado for `com_agent`.

Card, log de decisão e aviso de “agent pausado” não aumentam a contagem. Clique numa opção rápida aumenta, porque é fala da Ana.

## 16. Continuar outro dia

Tipo: Atendimento.

Ana conversa, o processo reinicia no dia seguinte, ela apresenta o mesmo cookie.

Esperado: a mesma conversa, as mesmas mensagens, o mesmo estado e os mesmos chamados. Se estava `em_atendimento` com o Rafael, o agent continua pausado.

## 17. Console

Tipo: Atendimento.

1. A conversa da Ana aparece em “Para você”, com o motivo e o resumo. “Com o agent” não a mostra.
2. Na espera, devolver ao agent volta o estado para `com_agent` sem Rafael ter respondido. Noutro caso, Rafael assume. O estado passa a `em_atendimento`, `analyst_id` é o dele, o compositor libera e uma fala da Ana não chama o modelo.
3. Encerrar a partir da espera falha. Rafael responde no histórico. O prazo do chamado citado reinicia, porque isso é uma atualização humana.
4. Rafael devolve ao agent. A próxima fala da Ana chama o modelo, e o contexto inclui a orientação da devolução.
5. Noutro caso, Rafael encerra. Nova fala naquela conversa é recusada. A Ana pode abrir outra conversa.

A busca por `INC-20311` acha a conversa da Ana e não lista chamado do Bruno.

## 18. Login

Tipo: Rotas.

- `ana.souza@nexo.com.br` e a senha `qualquer` entram no chat.
- `rafael.lima@nexo.com.br` e outra senha entram no console.
- `visitante@nexo.com.br` não entra.
- Senha vazia não entra.
- Cookie adulterado não lista chamados.

## 19. Rastro legível

Tipo: API, em qualquer resposta do agent dos cenários 1, 3 e 8.

Acima do texto, as ações reais, na ordem das tools e da política. No detalhe, um leitor vê:

- intenção;
- evidências com id de artigo ou chamado;
- regra que o código aplicou, distinta da regra que o modelo apenas citou, quando as duas divergirem;
- ação que aconteceu;
- segurança `baixo`, `medio` ou `alto`, e o percentual coerente com a faixa.

Se a política corrigir o modelo, o detalhe mostra as duas coisas: o que foi proposto e o que foi feito.

## 20. Carregamento e erro

Tipo: interface, na etapa 7.

- Enquanto `generate` não volta, o chat mostra carregamento e não aceita um segundo envio que duplique a fala.
- Com o simulador em falha, a confirmação mostra erro e o botão de tentar de novo usa o mesmo rascunho.
- Conversa pausada mostra que o agent não está respondendo, em vez de um spinner infinito.
- Meu perfil da Ana mostra o nome e o e-mail. “Redefinir senha” não dispara pedido de rede.
