# Requisitos — Nexo Assist

Fonte: `docs/Desafio_Tecnico_Nexo_Assist_PRD_v5.pdf` (PRD v5, 5 páginas). Não existe `docs/desafio.pdf` no repositório; o planejamento usa esse arquivo.

Como ler este documento:

- **Exigido** — está no PDF.
- **Hipótese** — o PDF deixa a regra ambígua. A interpretação abaixo é a que vamos implementar até você decidir outra.
- **Sugestão** — não está no PDF. É decisão nossa para cumprir o exigido com o código verificável.

O protótipo foi aberto em 27 de outubro de 2026: `https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg` (`nexo.pen`, somente leitura). A seção 10 descreve os frames, os textos e os tokens que estão no arquivo. O que o arquivo não desenha — carregamento, erro e o detalhe expandido da decisão — não é tratado como layout do Pencil.

## 1. Problema e sucesso

**Exigido** (p. 1, Contexto e objetivo). A Nexo tem cerca de 2.000 funcionários. O service desk hoje é um formulário: gera chamado para dúvida já documentada, duplicidade, prioridade errada e triagem manual.

O Nexo Assist é um chat. O funcionário descreve o problema com as próprias palavras. O agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados e chama um analista quando precisa.

Sucesso:

- Dúvida e consulta resolvidas no chat, sem fila.
- Chamado completo, com tipo, categoria e prioridade corretos, sem duplicidade.
- O que precisa de uma pessoa chega ao analista na hora certa, com contexto.
- Dá para entender o que o agent fez e por quê em cada resposta.

## 2. Usuários e histórias

**Exigido** (p. 1, Usuários e histórias).

Funcionário, identificado pelo e-mail corporativo:

1. Tirar dúvida sem abrir chamado.
2. Saber o estado de um chamado seu sem lembrar o número, inclusive se está atrasado.
3. Complementar um chamado aberto.
4. Abrir chamado conversando e conferir os dados antes da criação.
5. Falar com um analista quando preferir ou quando o problema for grave.
6. Voltar outro dia e continuar de onde parou.

Analista de Suporte N1 e N2:

1. Receber chamado com tipo, categoria, prioridade e descrição que não exijam perguntar tudo de novo.
2. Ver conversas que precisam dele, inclusive quando o agent não teve segurança para decidir.
3. Assumir a conversa, com o agent pausado, e devolvê-la ao agent ou encerrá-la.

As histórias 2 e 3 do analista são o console. O agent segue o Anexo A, a central de ajuda e os chamados existentes. O sistema de chamados é legado e fica indisponível por alguns segundos de vez em quando.

**Hipótese — papéis.** O PDF não diz se o analista entra pela mesma tela de login. Os dois papéis usam a Tela 1. O cadastro tem `funcionario` ou `analista`. O papel escolhe chat ou console. Um analista não vira dono dos chamados que atende.

**Hipótese — N1 e N2.** O PDF cita os dois níveis e não define fila nem permissão diferente. O protótipo, no caso do notebook vencido, escreve “Transferida para Suporte N2” e o analista que assume se identifica como Suporte N2. Há uma fila única. O analista tem um nível gravado, só para o crachá e para o texto da transferência. Não há console separado de N1.

## 3. O que construir

**Exigido** (p. 2). O Anexo C é a referência visual: seguir layout e estilo, com liberdade nos detalhes. O arquivo do Pencil foi lido; a estrutura, os textos e os tokens estão na seção 10. O comportamento abaixo já está no texto do PDF.

1. **Login (Tela 1).** E-mail corporativo e senha. Aceita os funcionários dos dados de exemplo com qualquer senha.
2. **Chat do funcionário (Telas 2 e 3).** Conversa com o Nexo Assist, respostas em tempo real, cards de chamado, seleção de chamado, rascunho para confirmação, perguntas com opções rápidas e limite de 30 mensagens por sessão.
3. **Agent.** Decide o que fazer a cada mensagem, usando a central de ajuda e o serviço de chamados, segundo o Anexo A.
4. **Serviço de chamados simulado.** Dados de exemplo nossos (Anexo B), separado do agent. Consultar, criar, atualizar e transferir.
5. **Transferência.** A conversa fica marcada como aguardando atendente. O agent para de responder até ser liberado.
6. **Console do analista (Telas 4 e 5).** Lista de conversas com filtros e status, histórico, assumir com o agent pausado, devolver ao agent, encerrar, e painel com os chamados do funcionário.
7. **Visibilidade das decisões.** Acima de cada resposta, as ações do agent (exemplos do PDF: “consultou seus chamados”, “classificou a prioridade”). Também deve ser possível ler o que ele entendeu, que ação tomou, com que grau de segurança e por quê. O formato é livre: expandir as ações, painel lateral ou log estruturado. Esta é a parte mais importante do desafio.

**Hipótese — tempo real.** “Respostas em tempo real” significa chat que não recarrega a página. Os frames mostram a resposta já pronta, com as ações em lista acima do texto. Não há frame de token surgindo aos poucos. A primeira versão espera a decisão validada e então mostra, juntos, as ações e o texto. O Mastra permite streaming; isso fica como ajuste de latência, não como layout do protótipo.

**Hipótese — sessão e 30 mensagens.** O PDF pede continuidade entre dias e também limite por sessão, sem definir “sessão”. O protótipo mostra o contador no compositor, no formato `18/30 mensagens nesta sessão`.

- Conversa: registro persistente do funcionário.
- Sessão: janela dessa conversa com no máximo 30 mensagens.
- Contam: falas do funcionário, do agent e do analista. Um clique em opção rápida conta se envia uma fala do funcionário.
- Não contam: log de decisão, metadados de card e avisos de sistema.
- No limite, o servidor recusa uma nova fala nessa sessão. O funcionário pode abrir outra sessão da mesma conversa. O histórico permanece. A sessão nova guarda um resumo da anterior para o agent não recomeçar do zero.
- “Voltar outro dia” reabre a conversa e a sessão ainda aberta. Se a sessão estiver cheia ou a conversa encerrada, abre-se outra sessão ou outra conversa, conforme o estado.

**Hipótese — filtros do console.** O PDF diz “filtros e status” e não lista os nomes. O protótipo lista quatro filtros, com busca “Pesquisar conversa ou chamado”:

- Todas: a fila inteira, inclusive conversas já resolvidas pelo agent.
- Para você: aguardando atendente e ainda sem analista.
- Com o agent: o agent ainda responde.
- Minhas: o analista autenticado já assumiu.

A busca casa nome, trecho da última fala ou número de chamado citado na conversa. Não é uma busca global de chamados de qualquer funcionário.

## 4. Requisitos técnicos

**Exigido** (p. 2, tabela).

| Tema | Requisito |
| --- | --- |
| Linguagem | TypeScript com tipagem estrita |
| Agent | Mastra, de preferência; LangGraph.js é a alternativa citada |
| Modelo | Qualquer provedor, com a escolha explicada no README |
| Interface | Seguir o protótipo do Anexo C. Next.js ou React são a sugestão do PDF |
| Dados | Serviço de chamados simulado, separado do agent |
| Persistência | Conversas, chamados e o estado de cada conversa (com o agent ou com um analista) sobrevivem a um reinício |
| Execução | Poucos comandos locais, documentados no README, e um `.env.example` |

**Exigido** (p. 2, “Também esperamos”):

- Separação entre interface, agent e serviços, com decisões justificadas.
- Código organizado, testes onde fazem diferença, tratamento de erros e commits que contem a história.
- Respostas rápidas e uso consciente do modelo, pensando em custo por conversa.
- Chaves fora do código. Chamados de um funcionário nunca expostos a outro.

**Sugestão — stack desta solução.** Next.js (App Router, runtime Node.js), Mastra, Zod 4 e SQLite via libSQL. O ajuste em relação a `better-sqlite3` está em `docs/arquitetura.md`, porque o armazenamento local oficial do Mastra é `@mastra/libsql`.

## 5. Regras do service desk

**Exigido** (p. 4, Anexo A).

- Tipo `INC`: algo parou ou não funciona. Tipo `REQ`: pedido de acesso, equipamento ou software.
- Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail e Outros.
- Abertura: título, descrição, tipo, categoria, prioridade e quem é afetado. O agent mostra um rascunho e só cria ou atualiza depois da confirmação do funcionário.
- Se já existe chamado aberto sobre o mesmo problema, atualiza em vez de duplicar. Chamado resolvido há até 7 dias pode ser reaberto.
- Transferência quando o funcionário pede, em caso crítico, em chamado vencido ou quando o agent não tem segurança. Leva um resumo. O agent não responde enquanto a conversa está com um analista.
- Informação de chamado só para quem o abriu.
- Apenas assuntos de TI. RH, financeiro e facilities são redirecionados.

Prioridade combina impacto (quantas pessoas) e urgência (compromisso em risco). O prazo vale para a primeira resposta e para cada atualização. Passado o prazo, o chamado está vencido.

| Prioridade | Quando usar | Prazo |
| --- | --- | --- |
| Crítica | Algo parado para uma equipe ou para a empresa | 1 hora |
| Alta | Impede uma pessoa de trabalhar, ou há compromisso no mesmo dia | 4 horas úteis |
| Média | Atrapalha, mas há alternativa | 3 dias úteis |
| Baixa | Pedidos e melhorias sem urgência | 5 dias úteis |

**Hipótese — cálculo da prioridade.** O PDF dá uma tabela de frases, não uma matriz completa. O código recebe impacto e urgência estruturados e aplica esta ordem:

1. Serviço parado para equipe ou empresa → Crítica.
2. Uma pessoa impedida de trabalhar, ou compromisso no mesmo dia → Alta.
3. Atrapalha e existe alternativa → Média.
4. Pedido ou melhoria sem urgência → Baixa.

Combinação ambígua, por exemplo equipe afetada com alternativa, cai em Média e o grau de segurança não pode ser alto. Se o agent não souber impacto ou urgência, pergunta; não inventa prioridade. A prioridade gravada no chamado é sempre a recalculada por essa função. O valor dito pelo modelo não é aceito sem passar por ela.

**Hipótese — calendário.** O PDF não define fuso, feriado nem se a hora crítica é corrida ou útil. O artigo de exemplo do Anexo B diz que o service desk funciona de segunda a sexta, das 8h às 18h, e que chamado crítico tem plantão de 24 horas. Usamos isso como calendário:

- Fuso `America/Sao_Paulo`.
- Hora útil: segunda a sexta, 08:00–18:00. Sem feriados nesta versão.
- Crítica: 1 hora corrida, por causa do plantão.
- Alta: 4 horas dentro da janela útil.
- Média e Baixa: 3 e 5 dias úteis.
- “Cada atualização” reinicia o prazo quando o funcionário complementa ou o analista responde. Rascunho não reinicia. Chamado resolvido não fica vencido.

**Hipótese — vencido.** Não é um status gravado. É `agora > prazo` e status diferente de resolvido. Consultar um chamado vencido obriga a transferência, mesmo que o texto do agent não peça.

**Hipótese — mesmo problema.** O PDF não define o algoritmo. Há duplicidade quando o dono é o mesmo e existe chamado não resolvido da mesma categoria com sobreposição clara de título e sintomas, ou quando o funcionário seleciona um card. Vários candidatos geram a pergunta de seleção da Tela 3, sem criar outro chamado. Resolvido há 7 dias corridos ou menos segue para reabertura, também com rascunho e confirmação. Resolvido há mais de 7 dias corridos permite chamado novo.

**Hipótese — grau de segurança.** O PDF não fixa a escala. A política usa `baixo`, `medio` e `alto`. O protótipo, na fila, mostra um percentual (“confiança 41%”). Os dois convivem: a faixa decide a transferência; o número só aparece na lista.

- `alto`: pode responder ou apresentar rascunho. Número de 80 a 100.
- `medio`: faz uma pergunta objetiva, com opções rápidas quando houver escolha fechada. Número de 50 a 79.
- `baixo`: transfere, com o resumo. O servidor transfere se a decisão vier com `baixo`, mesmo que a ação sugerida seja outra. Número de 0 a 49.

Se a faixa e o número discordarem, a faixa vence e o número exibido é recolocado dentro dela. O exemplo de 41% é `baixo`.

**Hipótese — fora de TI.** Intenção classificada como RH, financeiro ou facilities produz redirecionamento e não cria chamado. Se a classificação for incerta, o grau é `baixo` e a conversa transfere.

**Hipótese — privacidade no console.** A frase do Anexo A protege o chat: o agent não revela chamado de outra pessoa ao funcionário que está falando. O painel do analista mostra os chamados do funcionário daquela conversa. O analista não ganha busca global, e um funcionário não consulta chamado pelo número se o dono for outro.

## 6. Dados de exemplo

**Exigido** (p. 4, Anexo B). Criar os dados: alguns funcionários, 5 a 10 artigos curtos e chamados variados (aberto, vencido, resolvido recentemente e de outros funcionários).

Exemplos dados pelo PDF, que entram no seed:

- Artigo: VPN com erro 809. Reinstalar o cliente pelo portal de softwares e reiniciar. Vale para Windows 10. No Windows 11, abrir chamado.
- Artigo: service desk de segunda a sexta, 8h–18h. Chamado crítico tem plantão de 24 horas.
- `INC-20311`, notebook lento após atualização do Windows, Hardware, Média, aguardando analista, última atualização há 6 dias.
- `REQ-10442`, segundo monitor para home office, Hardware, Baixa, aprovado, há 1 semana.
- `INC-20150`, senha do SAP bloqueada, Acesso, Média, resolvido, há 4 dias.

**Hipótese — status gravados.** O PDF usa “aguardando analista”, “aprovado” e “resolvido”, e também fala em chamado aberto. O protótipo acrescenta os rótulos “Em andamento” e “Em atendimento”. Status persistidos: `em_andamento`, `aguardando_analista`, `em_atendimento`, `aprovado`, `resolvido`. “Vencido” continua derivado. `aprovado` é desfecho de requisição, não de incidente. `em_andamento` é o chamado aberto que não está nem na fila humana nem numa conversa assumida.

**Sugestão — volume do seed.** Os nomes que aparecem nos frames entram no seed, porque o PDF diz que os dados do protótipo são ilustrativos e ao mesmo tempo manda seguir o layout. Ana Souza (`ana.souza@nexo.com.br`) é a funcionária da conversa. Rafael Lima é o analista, Suporte N2. Bruno Tavares tem pelo menos um chamado que a Ana não pode ver. Os três números do Anexo B permanecem, mais os chamados que o painel da Ana mostra: `INC-20298` em andamento, `INC-19877` e `INC-19410` resolvidos. O PDF diz que `INC-20311` foi atualizado há 6 dias; o frame escreve “há 5 dias”. O seed usa a idade do PDF, para o teste de prazo não depender do texto congelado do mock. O domínio `@nexo.com.br` é o do frame de login.

## 7. Indisponibilidade do legado

**Exigido** (p. 1). O serviço de chamados fica indisponível por alguns segundos de vez em quando.

**Hipótese — sem duplicar.** O PDF não descreve retentativa. Cada criação ou atualização confirmada tem uma chave de idempotência gerada no rascunho e gravada na mesma transação do chamado. Falha antes do commit não grava nada; repetir a confirmação usa a mesma chave. Falha depois do commit devolve o chamado já criado. O rascunho só sai de pendente quando o serviço confirma a operação. O simulador precisa de um modo de falha controlado para teste.

## 8. Diferenciais, entrega e avaliação

**Exigido** (p. 3).

- Diferencial: deploy com chaves protegidas, limite de uso e explicação no README. A ausência não penaliza.
- Entregar repositório, README (como rodar, arquitetura, como o agent decide, como a qualidade das decisões foi garantida, trade-offs e o que faria com mais tempo) e, se houver, o link do deploy.
- Uso de IA é permitido. A entrevista conversa sobre o código e pede mudanças pequenas ao vivo.

| Critério | O que observam |
| --- | --- |
| Qualidade das decisões | Entende o pedido e escolhe a ação certa, seguindo as regras |
| Condução da conversa | Pergunta quando falta dado, confirma antes de agir, mantém contexto e responde com clareza |
| Transparência | Dá para ver e entender o que foi feito e por quê |
| Interface | Fidelidade ao protótipo e cuidado com carregamento e erro |
| Arquitetura e boas práticas | Separação, tipagem, erros, organização e commits |
| Comunicação | Clareza do README |
| Diferenciais | Deploy, sem penalidade se não existir |

**Sugestão.** Deploy fica por último e só se o núcleo local estiver demonstrável. Plataforma com disco persistente, ou libSQL remoto. Servidor sem disco apaga o SQLite a cada instância.

## 9. Critérios de aceite

Estes critérios são a forma testável dos itens exigidos. O cenário correspondente está em `docs/cenarios.md`.

1. Funcionário autenticado resolve a dúvida da VPN no Windows 10 sem chamado novo.
2. Windows 11 produz rascunho, e o chamado só existe depois da confirmação explícita.
3. Consulta sem número lista só chamados daquele funcionário, marca vencido pelo relógio e oferece analista.
4. Complemento de chamado aberto atualiza o existente e não cria outro.
5. Resolvido há 4 dias pode ser reaberto mediante confirmação. Resolvido há mais de 7 dias não reabre por essa regra.
6. Prioridade e prazo de cada linha da tabela do Anexo A saem da função de código, não do texto do modelo.
7. Pedido de analista, caso crítico, chamado vencido e segurança baixa transferem com resumo. Enquanto o estado não volta ao agent, uma mensagem nova não chama o modelo.
8. Analista autenticado assume, responde, devolve ao agent e encerra. A lista distingue esses estados.
9. Reiniciar o processo preserva conversa, chamados e se quem atende é o agent ou o analista.
10. E-mail fora do seed não entra. Senha qualquer entra só para e-mail do seed. Chamado de outra pessoa não aparece no chat nem numa consulta direta pelo número.
11. A 31ª mensagem da sessão é recusada pelo servidor. O contador visível usa o formato do protótipo, `n/30 mensagens nesta sessão`.
12. Uma falha transitória seguida de nova confirmação resulta em um único chamado.
13. Cada resposta do agent guarda ações visíveis, intenção, evidências, regra aplicada, ação e grau de segurança.
14. Assunto de RH, financeiro ou facilities é redirecionado e não abre chamado.
15. Carregamento e erro aparecem na interface quando o agent ou o serviço demoram ou falham. Esses dois estados não estão desenhados no Pencil; o texto do PDF é que os pede.
16. Os seis frames do Pencil estão representados: login, novo chamado, consulta, fila do analista, atendimento assumido e meu perfil. Confirmar, editar e cancelar um rascunho não gravam chamado antes da confirmação. Devolver ao agent existe na espera e no atendimento assumido. Encerrar só existe depois de assumir.
17. Meu perfil mostra nome e e-mail. “Redefinir senha” não envia e-mail: o PDF não pede correio, e a senha de demonstração continua sendo qualquer uma.

## 10. Protótipo

**Exigido** (p. 5, Anexo C). Os dados do protótipo são ilustrativos. A tabela do PDF tem cinco telas. O arquivo tem seis frames, todos desktop. Não há frame mobile.

| Frame no Pencil | Medida | O que o PDF chama | O que o frame mostra |
| --- | --- | --- | --- |
| Identificação | 1440×900 | Tela 1 | Vitrine à esquerda (800 px) e formulário à direita |
| Chat — Novo chamado | 1440×900 | Tela 2 | Sidebar, pergunta com opções, rascunho e contador |
| Chat — Consulta e transferência | 1440×900 | Tela 3 | Cards para escolher, prazo vencido e oferta de analista |
| Atendente — Conversas | 1440×900 | Tela 4 | Fila, conversa aguardando, agent pausado, chamados da Ana |
| Atendente — Atendimento assumido | 1567×900 | Tela 5 | Analista assumiu; devolver ao agent ou encerrar |
| Cliente — Meu perfil | 1440×900 | Não está na tabela do PDF | Nome, e-mail e senha “gerenciada pela TI” |

O sexto frame entra porque o PDF manda seguir o protótipo. Ele não cria um fluxo de correio.

### Login

Vitrine: “Service desk de TI da Nexo”, “Seu problema de TI, resolvido em uma conversa.”, um diálogo de exemplo e três números estáticos (8 s, 72%, 6 analistas). Esse diálogo de exemplo diz que o chamado já foi aberto. É vitrine, não a regra de confirmação. A conversa de verdade está no frame seguinte e pede confirmação.

Formulário: e-mail `ana.souza@nexo.com.br`, senha com exibir/ocultar, “Manter conectado neste computador”, “Esqueci minha senha”, “Problema para entrar? Ligue no ramal 4000”. O PDF continua mandando aceitar qualquer senha dos funcionários de exemplo. “Manter conectado” só alonga o cookie. “Esqueci minha senha” e o ramal são texto de apoio; não disparam e-mail nem telefonia.

### Chat do funcionário

Sidebar de 232 px: Nexo Assist, Atendimento, Meu perfil, o usuário e Sair. Barra de 64 px: “Service desk de TI / Atendimento” e “Assistente online”.

Acima de cada resposta, ações com visto. No frame de abertura: “consultou seus chamados”, “buscou na central de ajuda”, “classificou a prioridade”, “consultou o SLA”, “montou o rascunho”. No de consulta: “consultou seus chamados”, “consultou o INC-20311”, “calculou o prazo”.

Opções numeradas: “Só eu”, “Minha equipe”, “Toda a empresa”, “Não sei”. “Não sei” não vira prioridade inventada.

O rascunho é um card: “Novo chamado”, “Rascunho D-381”, “Aguardando confirmação”, título, descrição, categoria, prioridade com “resposta até 13:43”, afetados e os botões Confirmar, Editar e Cancelar. Editar e cancelar também não gravam. O atalho desenhado é ⌘↵; no Windows o mesmo papel é Ctrl+Enter.

A consulta lista três cards e, depois da escolha, o card do `INC-20311` com “prazo vencido” e as opções “Falar com um analista”, “Adicionar informação” e “Não, obrigado”. A categoria aparece como “Hardware › Notebook”. A categoria gravada continua sendo a lista do Anexo A. O trecho depois do › é detalhe de assunto, sem regra nova.

O compositor diz “Escreva para o Nexo…” e mostra o contador da sessão.

### Console

Quatro colunas: trilho de 64 px, lista de 380 px, conversa, painel de chamados de 340 px. O frame assumido é mais largo (1567) por causa dessas colunas.

Filtros e busca, como na hipótese da seção 3. Cada linha tem nome, hora, última fala e um estado: “Transferida”, “Agent pediu ajuda · confiança 41%”, “Agent atendendo”, “Resolvida pelo agent” ou “Você está atendendo”. O analista aparece como “Disponível”. Isso é um rótulo, não um sistema de presença.

Na espera, a faixa diz “Ana espera um atendente” e “Agent pausado”. O compositor fica desabilitado: “Assuma o atendimento para responder”. Os dois botões visíveis são “Devolver ao agent” e “Assumir atendimento”. Devolver, portanto, existe antes de assumir. Encerrar não aparece nesse frame.

Depois de assumir, a linha de sistema é “Rafael Lima assumiu · agent pausado”. Os botões passam a “Devolver ao agent” e “Encerrar atendimento”. O compositor libera a resposta. O chamado da conversa muda o rótulo para “Em atendimento”.

O painel “Chamados da Ana” separa “Desta conversa” e “Outros chamados”, conta abertos e encerrados e tem “Ver todos os chamados da Ana”. São os chamados daquela funcionária, inclusive resolvidos. Não é busca de toda a empresa.

A frase “em até 2 h úteis” e o relógio “até 12:05” estão no texto de exemplo da transferência. Não entram na tabela de prazo do Anexo A. A faixa obrigatória é “Agent pausado”.

### Meu perfil

Mesma sidebar do chat. Mostra nome, e-mail, “Gerenciado pela TI” e “Redefinir senha”, com o texto de que um link seria enviado. Não há serviço de e-mail no PDF. O botão explica isso e não envia nada. “Alterada há 42 dias” é cópia ilustrativa: não há histórico de senha para calcular.

### O que o arquivo não desenha

Não há frame de carregamento, de erro, nem do detalhe expandido da decisão. As ações acima da resposta estão desenhadas. Intenção, evidências, regra, ação e grau de segurança continuam obrigatórios pelo PDF, no formato livre: a lista de ações abre esse detalhe. Não vou desenhar um painel lateral e dizer que o Pencil o tem.

Tokens lidos no arquivo, para a etapa visual: papel `#FFFFFF`, mesa `#F6F7F9`, tinta `#1B2431`, CTA `#0062C4`, mais as escalas `primary`, `success`, `warning` e `danger`. Fontes nomeadas: Newsreader, Schibsted Grotesk, Geist, Geist Mono e IBM Plex Mono. Espaçamento fino de cada bloco fica para comparar com o frame na implementação. O arquivo não foi copiado para o repositório.
