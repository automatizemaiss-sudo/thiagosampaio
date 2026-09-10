# Histórico da régua — `vw_clara_etapas_r2` e derivadas

Cada entrada aqui é uma mudança de `versao_regras` na view `vw_clara_etapas_r2`
(e nas views que dependem dela: `vw_funil_diario_r2`, `vw_funil_guia_diario_r2`).
Serve pra responder uma pergunta específica quando um número do funil mudar:
**a régua mexeu, ou chegou dado novo no período?** Cada entrada é uma causa só —
não misturar duas mudanças diferentes na mesma entrada.

---

## r2 → r2.1 — dia da conversa passa a ser o dia da resposta do lead

**Data da mudança:** 2026-09-08/09.

**O que mudou:** `dia` deixou de ser `primeira_msg` (primeira mensagem da Clara
na sessão, que podia ser de um disparo antigo) e passou a ser
`primeira_resposta_lead` (`min(created_at) FILTER (WHERE t IN ('human','user'))`).
Como `session_id` é o telefone e a sessão nunca reseta, um lead que já tinha
falado com a Clara antes ficava datado lá atrás e sumia da janela do período
selecionado.

**Por quê:** lead que respondeu de novo dentro do período escolhido precisa
aparecer no funil desse período — a data tem que refletir quando ele
efetivamente conectou, não a primeira vez que qualquer mensagem entrou na
sessão.

**Efeito medido:** contagem de "responderam" (principal + presente gratuito)
subiu de 347 para a faixa de 400+, dependendo do corte de data usado na
comparação — o efeito cresce com o tempo porque mais sessões antigas voltam a
ter atividade dentro da janela.

---

## r2.1 → r2.2 — join de `clara_eventos` corrigido (telefone não normalizado)

**Data da mudança:** 2026-09-09/10.

**O que era o bug:** a CTE `ev` (que decide `ev_link` — evento real
`link_enviado` — e `transferida` — evento `transferir_humano`) juntava
`clara_eventos.session_id` contra `n8n_chat_histories.session_id` por
igualdade direta (`USING (session_id)`). `n8n_chat_histories.session_id` vem
com `+` na frente (`+5527988475200`); `clara_eventos.session_id` vem sem
(`5527988475200`). A comparação nunca batia — `ev_link` e `transferida`
saíam `false`/`null` para 100% das sessões, sempre, desde que esse evento
existe. A etapa 8 (link) dependia então só do texto da mensagem
(`thiagosampaionutricao.com/pay` no corpo), que é a fonte fraca, não a forte.

**A correção:** normalizar o telefone dos dois lados do join, no mesmo padrão
já usado em `vd` (vendas) e `fu` (followup) na mesma view —
`right(regexp_replace(session_id, '\D', '', 'g'), 10)`.

**Efeito medido** (visão geral da base, antes vs. depois da correção):

| | Antes (join quebrado) | Depois (join corrigido) |
|---|---|---|
| Sessões com etapa ≥ 8 (link) — período 08/09–09/09 | 17 | 83 |
| Sessões com etapa ≥ 8 (link) — resto da base | 133 | 138 |
| Sessões com `transferida = true` | 0 | 12 |
| Sessões com etapa 9 (venda) | sem mudança (não depende de `ev`) | sem mudança |

**Não confundir com a mudança de processo de 08/09** (ver entrada abaixo):
esta correção destrava a *visibilidade* do evento de link que já existia —
não muda o processo de vendas em si. A prova de que a fusão oferta+link é
real (e não apenas o join corrigido revelando dado antigo) está na
comparação de horários, na entrada seguinte.

---

## Mudança de processo (não é `versao_regras`) — fusão de oferta e link, 08/09/2026

**Data:** a partir de 2026-09-08, por decisão do Matheus.

**O que mudou no processo (fora do banco):** oferta da CDA e link de
pagamento passaram a ser enviados juntos (mesmo fluxo, near-simultâneo),
substituindo o processo anterior de enviar em momentos separados — pra
atacar o gargalo Oferta → Link que o funil vinha medindo entre 17% e 24%.

**Confirmado por medição** (diferença entre o horário do evento
`link_enviado` e o horário da mensagem de oferta na mesma sessão, só depois
da correção do join acima — antes da correção o evento não era visível):

| | Sessões medidas | Fusão em até 15s | Mediana | Média |
|---|---|---|---|---|
| A partir de 08/09/2026 | 67 | 62 (93%) | -3,5s | 15,0s |
| Antes de 08/09/2026 | 13 | 6 (46%) | 123s (~2min) | 30.406s (~8,4h) |

A diferença é gritante: depois da mudança, o link chega alguns segundos
*antes* da mensagem de oferta terminar de ser registrada (mesmo disparo,
duas gravações quase simultâneas). Antes, a mediana era de minutos e a média
inflada por casos de horas — etapas de fato separadas no processo antigo.

**Implementado:** o front funde as etapas 7 e 8 numa barra só ("Oferta + Link
de pagamento") quando o período selecionado cai **inteiro** em `>= 2026-09-08`.
Período misto ou anterior mantém as duas etapas separadas, como sempre foram
— decisão tomada pra não misturar os dois regimes na mesma barra agregada.

---

## r2.2 → r2.3 — regex da etapa 8 desatualizada + marcadores de desvio (Seguro/follow-up)

**Data da mudança:** 2026-09-10.

**O que era o problema:** depois de corrigir o join da `ev` (entrada acima),
a cobertura de link ainda parecia baixa — porque a marca de **texto** da
etapa 8 só reconhecia `thiagosampaionutricao.com/pay`, e o link de pagamento
real migrou pra `go.thiagosampaionutricao.com/pay` (e a variante com cupom,
`estrategia-cda-cupom`). A dupla verificação (join quebrado + regex
desatualizada) escondeu o problema duas vezes seguidas — cada correção
revelava que a cobertura real era maior do que a anterior sugeria.

**A correção:** `m8_link_cda` passou a reconhecer
`go.thiagosampaionutricao.com/pay` e `estrategia-cda-cupom`, mantendo a
mesma exclusão implícita de sempre para os domínios de pós-compra, Guia e
Seguro (eles usam caminhos próprios, nunca bateram nessa regex e não devem
bater).

**Efeito medido** (`principal`, 08/09–10/09, com o join já corrigido nas
duas medições):

| | Regex antiga | Regex nova |
|---|---|---|
| Cobertura oferta → link | ~89% | ~95% (98 de 103) |

**Também descoberto no processo (Causa 3 do brief) — não é bug de banco, é
erro de metodologia de medição:** comparar "quantos viram a oferta" contra
"quantos receberam o link" sem excluir quem foi desviado pra outro caminho
sempre vai parecer pior do que é. Quem objeta valor/prazo e recebe o Seguro
Proteção de Preço, ou é redirecionado pro Guia Nutricional, ou só teve um
follow-up marcado pra depois — não é link "perdido", é o funil funcionando.
Por isso a view ganhou dois marcadores novos (colunas ao final, não mudam
`etapa_max`):

- `ofertou_seguro` — mensagem contém `cl-seguro-protecao-preco` (o checkout
  do Seguro Proteção de Preço; ver `dashboard/BRIEF_FUNIL_SEGURO_PROTECAO.md`
  pro sub-funil completo desse produto, fora do escopo desta entrada).
- `marca_followup` — evento real `marca_followup` em `clara_eventos` (mesma
  CTE `ev`, já com o telefone normalizado).

No período medido, dos 5 que viram a oferta e não têm link: 1 Seguro, 1
Guia, 1 follow-up marcado, e **2 sem nenhum desvio** — são esses 2, não os 5,
que merecem atenção como possível falha real.

---

## r2.3 → r2.4 — `ofertou_seguro` corrigido (estava marcando o link, não a oferta) + Funil do Seguro

**Data da mudança:** 2026-09-10.

**O que era o problema:** a entrada anterior criou uma coluna `ofertou_seguro`
que na prática guardava se o **link** do Seguro (`cl-seguro-protecao-preco`)
tinha sido enviado — não se o Seguro tinha sido **oferecido por texto**. Não
tinha marcador nenhum pra oferta verbal, então não dava pra montar um funil
Ofertou → Link → Venda como o do Guia.

**Investigação:** medido no banco, a Clara oferece o Seguro por texto
("seguro" + "49,90") bem mais vezes do que manda o link de fato — 242
sessões com a menção verbal contra 44 com o link real (18% de conversão
oferta→link, mesmo padrão comportamental do Guia: oferecer não implica
mandar o link na mesma hora). Conferi manualmente uma amostra da menção
verbal pra garantir que não é falso positivo — são mensagens genuínas
("Seguro Proteção de Vaga por R$49,90... quer que eu te envie o link?").

**A correção:** `ofertou_seguro` passou a ser a menção verbal; o link ganhou
coluna própria, `link_seguro`. Criado `vw_funil_seguro_diario_r2` +
`clara_funil_seguro_diario`, mesmo padrão do Guia, e um painel "FUNIL DO
SEGURO PROTEÇÃO DE VAGA" no front, ao lado do painel do Guia.

**Também:** a quebra por motivo da etapa 8 (entrada anterior) virou clicável
— cada categoria (Seguro/Guia/Pausado/Sem desvio) abre a lista de quem está
nela, com nome, telefone e link do Chatwoot, sem precisar de uma nova
consulta (usa os mesmos dados já carregados pra contar).
