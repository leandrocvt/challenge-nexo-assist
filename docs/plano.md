# Plano de implementação — Nexo Assist

Cada etapa deixa o projeto executável e tem uma verificação que não depende da etapa seguinte. Não avançar de etapa com a verificação anterior falhando.

Commits pequenos, um por etapa, contando por que a regra ficou naquele módulo. Chaves só em `.env`, nunca no commit. O README final espera a etapa 10; até lá, o README pode descrever apenas como rodar o que já existe.

A UI segue os seis frames descritos em `docs/requisitos.md`. Etapas anteriores provam comportamento por teste e por resposta HTTP. Carregamento e erro não estão no Pencil; mesmo assim entram, porque o critério de interface do PDF pede os dois.

## Etapa 1 — Esqueleto e política pura

Criar o app Next.js com TypeScript `strict`, Zod 4, Vitest e `@libsql/client`. Pastas de interface, atendimento, agent, serviço de chamados e política, ainda sem LLM. Implementar só as funções puras de prioridade, prazo, vencimento, janela de 7 dias e contagem de sessão.

Verificação:

- `tsc --noEmit` passa.
- Os testes da tabela do Anexo A passam: Crítica 1 hora corrida, Alta atravessando a noite e o fim de semana, Média 3 dias úteis, Baixa 5 dias úteis, resolvido há 4 dias reabre, há 8 dias não reabre, sessão com 30 aceita e a 31ª não.
- A página inicial diz que a interface ainda não reproduz o protótipo. Ela não imita os frames.

## Etapa 2 — SQLite, seed e serviço de chamados

Migração do arquivo `data/nexo.db`, seed do Anexo B e o serviço com consulta por dono, criação, atualização, reabertura e transferência de chamado. Chave de idempotência na mesma transação. Modo de teste que falha antes do commit e outro que falha depois de gravar, devolvendo o mesmo chamado na repetição.

Verificação:

- Teste de integração: dois funcionários; a listagem de um não contém o chamado do outro; buscar o número alheio não retorna o registro.
- O seed contém os três chamados do PDF, de 5 a 10 artigos, um chamado vencido e um resolvido há mais de 7 dias.
- Duas confirmações com a mesma chave, a primeira interrompida pela falha simulada, produzem um único chamado.
- Apagar o processo não apaga o arquivo. Um segundo teste abre o mesmo arquivo e lê o chamado.

## Etapa 3 — Sessão e isolamento nas rotas

Login por e-mail do seed e senha não vazia. Cookie httpOnly assinado. Rotas de conversa recusam cookie ausente e conversa de outro funcionário. O estado da conversa persiste.

Verificação:

- E-mail desconhecido recebe erro e nenhum cookie.
- E-mail do seed com senhas diferentes entra.
- Requisição sem cookie não lista chamados.
- Funcionário A, com o id da conversa de B, recebe 404.
- Reiniciar o servidor e apresentar o mesmo cookie devolve a mesma conversa e o mesmo estado.

## Etapa 4 — Máquina de atendimento, sem modelo

Estados `com_agent`, `aguardando_analista`, `em_atendimento` e `encerrada`. Rascunho pendente. Confirmação chama o serviço. Transferência grava resumo e motivo. Limite de 30 por sessão. Nesta etapa um “agent falso” devolve decisões fixas, para provar o portão antes do Mastra.

Verificação:

- Decisão de abertura deixa rascunho e zero chamados novos. A rota de confirmar cria um. Repetir a confirmação não cria outro.
- Atualização de chamado aberto segue o mesmo rascunho e não duplica.
- Nos quatro gatilhos, o estado vai para `aguardando_analista` com resumo. A mensagem seguinte é gravada e o agent falso não é chamado. O teste espia o número de chamadas.
- Assumir só sai de `aguardando_analista`. Devolver funciona na espera e no atendimento e volta a permitir o agent falso. Encerrar a partir da espera falha. Editar ou cancelar o rascunho não cria chamado.
- A 31ª fala é rejeitada sem chamar o agent falso.

## Etapa 5 — Agent Mastra atrás do portão

Agent com tools de leitura da central de ajuda e dos chamados. `RequestContext` carrega `employeeId`. `generate` usa `structuredOutput` com modelo estruturador e `errorStrategy: 'strict'`. Sem tool de escrita. O atendimento continua recalculando prioridade, recusando ação ilegal e gravando o rastro.

Verificação, sem olhar só para o texto livre:

- Teste com modelo substituto ou tool executada direto: sem `employeeId` no contexto, a tool não devolve chamado.
- A tool ignora um id de outra pessoa pedido no argumento.
- Uma decisão fixture com prioridade “Baixa” e impacto de empresa parada vira Crítica no rascunho, e o rastro cita a regra do código.
- Uma decisão fixture com segurança `baixo` transfere, qualquer que seja a ação proposta.
- Comando opcional, fora da suíte padrão, roda `runEvals` nos cenários marcados como avaliação de agent em `docs/cenarios.md`.

## Etapa 6 — API do chat e do console

Rotas do funcionário: listar e continuar conversa, enviar mensagem, confirmar ou cancelar rascunho. Rotas do analista: listar por estado, ler histórico, ler chamados daquele funcionário, assumir, responder, devolver e encerrar. Respostas incluem ações visíveis e o rastro. Erros do legado voltam como erro recuperável, com o rascunho intacto.

Verificação:

- Exercitar os fluxos com o cliente HTTP contra o servidor local, usando o seed: dúvida, rascunho, confirmação, consulta vencida, transferência e o ciclo do analista.
- Durante `aguardando_analista` e `em_atendimento`, o log do servidor não mostra chamada ao modelo.
- O detalhe da decisão contém intenção, evidências, regra, ação e segurança para cada resposta do agent.

## Etapa 7 — Interface na estrutura do Pencil

Seis rotas, com as regiões já lidas no arquivo: login com vitrine e formulário; chat com sidebar, ações acima da resposta, opções, card de rascunho, contador `n/30` e consulta com prazo vencido; console em espera e console assumido, com filtros, compositor bloqueado até assumir e painel de chamados; meu perfil sem envio de e-mail. Carregando e erro visíveis, mesmo sem frame para eles. O detalhe da decisão abre a partir da lista de ações. Ainda não é a passagem final de cor e tipo.

Verificação:

- No browser, percorrer login, rascunho que não grava antes do sim, editar, cancelar, pausa, assumir, devolver a partir da espera, encerrar e erro quando o simulador está em falha.
- Conferir isolamento com dois funcionários em dois cookies.
- Conferir que cada região da seção 10 de `docs/requisitos.md` existe na tela. A comparação de pixel fica na etapa 8.

## Etapa 8 — Fidelidade visual

Ajustar cor, tipo, raio e espaçamento aos tokens e aos frames do Pencil. O diálogo de marketing do login não vira regra de negócio. Textos de exemplo que contradizem o Anexo A, como “há 5 dias” contra os 6 dias do PDF, mostram o valor calculado.

Verificação:

- Repetir no browser os fluxos da etapa 7 e comparar cada rota com o frame correspondente, aberto no Pencil.
- Carregamento e erro continuam presentes, identificados como exigência do PDF e não como frame existente.

## Etapa 9 — Avaliação das decisões e custo

Congelar os cenários de agent, registrar onde o modelo erra e corrigir primeiro a política ou a tool, só depois o prompt. Limitar o histórico enviado ao modelo à janela necessária. Documentar no README o modelo escolhido e o que fica de fora de cada chamada.

Verificação:

- O comando de eval cobre dúvida sem chamado, abertura com confirmação, duplicidade, reabertura, crítico, vencido, fora de TI e chamado alheio.
- O teste de política continua passando sem rede.

## Etapa 10 — README e execução local

README com os comandos, a arquitetura, como a decisão é tomada, como a qualidade é verificada, os trade-offs e o que ficaria para mais tempo. `.env.example` completo.

Verificação:

- A partir de um clone limpo, os comandos do README instalam, migram, sobem o app e a suíte sem LLM passa.
- Nenhuma chave aparece no repositório.

## Etapa 11 — Deploy, se houver tempo

**Diferencial, não bloqueia.** Publicar com segredo fora do código, cota ou senha de demonstração para limitar abuso, e banco com disco de verdade. Explicar a limitação do arquivo SQLite em ambiente sem disco.

Verificação:

- O link abre a Tela 1, o fluxo de rascunho funciona depois de um restart da plataforma e um terceiro não consegue queimar cota ilimitada de LLM.

## Ordem e primeira etapa

A etapa 1 é o começo. Ela fixa o TypeScript estrito e as regras que a entrevista mais provavelmente pede para mudar: prazo, prioridade e contagem. O Mastra entra na etapa 5, quando já existe um portão capaz de recusar o modelo.

Não implementar as etapas 2–11 neste momento. A revisão deste plano vem antes do código.
