/**
 * ═══════════════════════════════════════════════════════════════════
 *  TS NUTRIÇÃO — BACKEND DO DASHBOARD (Google Apps Script)
 *  v3 — ENDPOINT ÚNICO + CACHE + ROI
 * ═══════════════════════════════════════════════════════════════════
 *
 *  O QUE MUDOU NESTA VERSÃO (e por quê)
 *  ─────────────────────────────────────────────────────────────────
 *  Em relação à v2 (endpoint único + cache), esta versão adiciona o
 *  cálculo de ROI mensal (getRoi), que entra como mais um campo dentro
 *  do MESMO payload de ?sheet=all — não é uma requisição nova. O motivo
 *  é o mesmo que motivou o endpoint único na v2: qualquer chamada extra
 *  concorrente ao /exec arrisca reintroduzir o engasgo do redirect 302.
 *
 *  O ROI depende de uma aba nova, "Config" (ver seção "AZ ABA CONFIG"
 *  abaixo), que não existe por padrão na planilha — crie-a antes de
 *  implantar esta versão, senão o cálculo usa os valores padrão
 *  (taxa_liquido = 0,93 e a tabela de faixas hardcoded) e loga um aviso
 *  nos logs de execução.
 *
 *  O CACHE_KEY mudou de _v2 para _v3 porque o FORMATO do payload mudou
 *  (novo campo "roi"). Isso invalida na hora qualquer cache antigo que
 *  ainda estivesse vivo, evitando servir por até 10 min um payload sem
 *  ROI depois do deploy.
 *
 *  ─────────────────────────────────────────────────────────────────
 *  ABA CONFIG — CRIE ESTA ABA ANTES DE IMPLANTAR
 *  ─────────────────────────────────────────────────────────────────
 *  Crie uma aba chamada exatamente "Config" com este layout (os dois
 *  blocos ficam lado a lado, em colunas diferentes da MESMA aba):
 *
 *  Colunas A:B — taxa de líquido (par chave/valor):
 *    A1: chave           B1: valor
 *    A2: taxa_liquido    B2: 0,93
 *
 *  Colunas D:G — tabela de faixas de comissão:
 *    D1: meta          E1: piso   F1: teto   G1: percentual
 *    D2: Fraca         E2: 0      F2: 30000  G2: 0,05
 *    D3: Média fraca   E3: 30000  F3: 50000  G3: 0,06
 *    D4: Média forte   E4: 50000  F4: 65000  G4: 0,07
 *    D5: Forte         E5: 65000  F5: (vazio) G5: 0,08
 *
 *  A faixa é escolhida por FL >= piso E (teto vazio OU FL < teto) — ou
 *  seja, o teto é exclusivo. F5 fica vazio de propósito (= infinito).
 *
 *  ─────────────────────────────────────────────────────────────────
 *  REGRAS DE NEGÓCIO DO ROI (resumo — ver getRoi() para os detalhes)
 *  ─────────────────────────────────────────────────────────────────
 *  FB  = soma de "valor" da aba VENDAS (linhas "Sim", já excluindo
 *        "Repetição"), agrupado por mês da "dia_de_venda".
 *  FL  = FB × taxa_liquido.
 *  COM = FL × percentual da faixa do FL do MÊS — MAS se já existir uma
 *        linha na aba Custos com Categoria = "Comissões" referente a esse
 *        mês, usa-se o valor REAL lançado no lugar do calculado. O
 *        pagamento sai por volta do dia 15 do mês SEGUINTE ao mês de
 *        referência (ex.: um lançamento datado de 17/08 é o pagamento
 *        da comissão de JULHO) — por isso getRoi() atribui essa linha
 *        ao mês anterior ao da data de lançamento (ver mesAnterior()).
 *        Enquanto não é lançada, o mês fica com o valor estimado por
 *        fórmula (campo "comissao_lancada: false" no JSON).
 *  CR  = soma de "Valor" da aba Custos por mês, EXCLUINDO as linhas de
 *        Categoria = "Comissões" (que viram COM, não custo registrado
 *        — senão a comissão contaria duas vezes).
 *  CT  = CR + COM.
 *  ROI múltiplo    = FL / CT (null se CT = 0, para o front mostrar "—")
 *  ROI percentual  = (FL - CT) / CT
 *
 *  Categorias de custo mapeadas para os buckets do JSON
 *  (custos_por_categoria), conforme a lista de categorias real da
 *  planilha:
 *    "Templates da Meta", "Meta"                 → templates
 *    "Tokens - OpenAI", "Tokens - OpenRouter",
 *    "OpenRouter"                                → tokens
 *    "Implementação"                             → implementacao
 *    "Manutenção"                                → salario (é onde o
 *                                                   custo de salário é
 *                                                   lançado hoje)
 *    "Comissões"                                 → excluída de CR (via COM)
 *    qualquer outra categoria não listada        → outros
 *
 *  O período (data de/até) é filtrado NO DASHBOARD, não aqui — o
 *  getRoi() sempre devolve o histórico completo, mês a mês. É assim
 *  que os outros dados (vendas, custos, dados diários) já funcionam
 *  hoje: o /exec não recebe parâmetro de data, o front filtra os
 *  arrays já carregados. Isso também é o que garante a regra da faixa
 *  "mês a mês": o front nunca deve somar o FL de vários meses antes de
 *  escolher uma faixa, e sim somar as comissões JÁ CALCULADAS por mês.
 *
 *  ─────────────────────────────────────────────────────────────────
 *  COMO INSTALAR
 *  ─────────────────────────────────────────────────────────────────
 *  1. Abra a planilha "dados_performance_automacao_tsnutri".
 *  2. Crie a aba "Config" com o layout descrito acima.
 *  3. Extensões → Apps Script.
 *  4. Apague o conteúdo do Code.gs e cole TODO este arquivo.
 *  5. Implantar → Gerenciar implantações → clique no LÁPIS ✏️ da
 *     implantação ativa → Versão: "Nova versão" → Implantar.
 *     ⚠️ Use o lápis, NÃO "Nova implantação" — assim a URL /exec
 *     continua a mesma e você não precisa mexer no performance.html.
 *  6. Aproveite e arquive as implantações antigas "Sem título" que
 *     estão acumuladas ali (deixe só a ativa).
 *
 *  ENDPOINTS
 *    /exec                      → payload completo (mesmo que ?sheet=all)
 *    /exec?sheet=all            → payload completo (agora inclui "roi")
 *    /exec?sheet=all&nocache=1  → payload completo ignorando o cache
 *    /exec?sheet=dados          → só métricas diárias (legado, array)
 *    /exec?sheet=vendas         → vendas (legado)
 *    /exec?sheet=segmentacoes   → funis por "segmentacao" (legado)
 *    /exec?sheet=qualwebn       → funis por "qual_webn" (legado)
 *    /exec?sheet=templates      → funis por "template_name" (legado)
 *    /exec?sheet=transferencias → transferências (legado)
 *    /exec?sheet=custos         → custos (legado)
 *    /exec?sheet=followups      → follow-ups (legado)
 *    /exec?sheet=roi            → ROI mensal isolado (legado/depuração)
 *
 *  POST /exec  body: {"action":"classificarVendas"}
 *    → classifica duplicatas de venda (ver classificarVendas()).
 *      Também LIMPA O CACHE ao final, para o dashboard já enxergar a
 *      reclassificação na próxima leitura.
 *
 *  ─────────────────────────────────────────────────────────────────
 *  NOTAS DE DOMÍNIO (mantidas da versão anterior)
 *  ─────────────────────────────────────────────────────────────────
 *  "segmentacao", "qual_webn", "template_name" e "lancamento" são
 *  colunas presentes em CHAMADO, CONEXÃO, LINK, NAO_CHAMADO e SEM
 *  INTERESSE (nem todas em todas as abas). A aba VENDAS não tem essas
 *  colunas, então para contar vendas dentro de cada segmentação/
 *  qual_webn/template cruzamos pelo telefone com o registro de
 *  CHAMADO/CONEXÃO/LINK mais próximo (na data da venda ou antes dela).
 *
 *  MÉTRICAS DE ENTREGA (Enviadas/Entregues/Lidas/Erros): no GERAL vêm
 *  prontas da aba DADOS. Por TEMPLATE vêm da aba Custos, categoria
 *  "Templates da Meta". Segmentações e Qual Webn NÃO têm esse dado (a
 *  Meta não reporta entrega quebrada por telefone) — ficam null.
 *
 *  READ_RATE da planilha NÃO é usado: é uma taxa, e taxas não podem ser
 *  somadas dia a dia. O front recalcula como Lidas/Entregues do período.
 *
 *  LINKS não vem da coluna LINKS da aba DADOS: é recalculado da aba LINK
 *  com dedupe por telefone (1 por lead, mesmo com reenvio).
 *
 *  FOLLOW-UPS MARCADOS vem da aba "follow-ups_marcados", agrupado pela
 *  data de "momento_em_que_foi_marcado", com telefones únicos por dia.
 * ═══════════════════════════════════════════════════════════════════
 */

// ───────────────────────────────────────────────
// CONFIG
// ───────────────────────────────────────────────
const SHEETS = {
  DADOS:               'DADOS',
  CHAMADO:             'CHAMADO',
  NAO_CHAMADO:         'NAO_CHAMADO',
  CONEXAO:             'CONEXÃO',
  SEM_INTERESSE:       'SEM INTERESSE',
  LINK:                'LINK',
  VENDAS:              'VENDAS',
  TRANSFERENCIAS:      'Transferências Humano',
  CUSTOS:              'Custos',
  FOLLOWUPS:           'f-ups',
  FOLLOWUPS_MARCADOS:  'follow-ups_marcados',
  CONFIG:              'Config',
};

const TIMEZONE = Session.getScriptTimeZone() || 'America/Sao_Paulo';

// Cache do payload completo.
// Suba o sufixo _v3 para _v4 etc. se mudar o FORMATO do payload — isso
// invalida na hora todo cache antigo que ainda estiver vivo.
const CACHE_KEY = 'ts_dashboard_all_v3';
const CACHE_TTL = 600; // segundos (10 min)

// ───────────────────────────────────────────────
// ROTEAMENTO
// ───────────────────────────────────────────────
function doGet(e) {
  const sheetParam = (e && e.parameter && e.parameter.sheet) || '';
  const noCache    = !!(e && e.parameter && e.parameter.nocache);
  let payload;
  try {
    switch (sheetParam) {
      // Sem parâmetro ou "all" → payload completo (usado pelo dashboard v2)
      case '':
      case 'all':
        payload = getAllCached(noCache);
        break;

      // ── endpoints legados: continuam funcionando isoladamente ──
      case 'dados':
        payload = getDadosDiarios(makeCtx());
        break;
      case 'vendas':
        payload = getVendas(makeCtx());
        break;
      case 'segmentacoes':
        payload = getGroupedFunil('segmentacao', makeCtx());
        break;
      case 'qualwebn':
        payload = getGroupedFunil('qual_webn', makeCtx());
        break;
      case 'templates':
        payload = getGroupedFunil('template_name', makeCtx());
        break;
      case 'transferencias':
        payload = getTransferencias(makeCtx());
        break;
      case 'custos':
        payload = getCustos(makeCtx());
        break;
      case 'followups':
        payload = getFollowups(makeCtx());
        break;
      case 'roi':
        payload = getRoi(makeCtx());
        break;
      default:
        payload = { ok: false, msg: 'Parâmetro "sheet" desconhecido: ' + sheetParam };
    }
  } catch (err) {
    payload = { ok: false, msg: String(err) };
  }
  return jsonOutput(payload);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  let result;
  try {
    if (body.action === 'classificarVendas') {
      result = classificarVendas();
      limparCache(); // a classificação muda quais vendas são válidas
    } else if (body.action === 'limparCache') {
      limparCache();
      result = { ok: true, msg: 'Cache limpo.' };
    } else {
      result = { ok: false, msg: 'Ação desconhecida: ' + body.action };
    }
  } catch (err) {
    result = { ok: false, msg: String(err) };
  }
  return jsonOutput(result);
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────────────────────────
// PAYLOAD COMPLETO + CACHE
// ───────────────────────────────────────────────
// Monta tudo numa passada só, usando um único ctx — ou seja, cada aba
// da planilha é lida EXATAMENTE UMA VEZ por execução, mesmo que quatro
// builders diferentes precisem dela.
function getAll() {
  const ctx = makeCtx();
  return {
    ok: true,
    generatedAt:    new Date().toISOString(),
    dados:          getDadosDiarios(ctx),
    vendas:         getVendas(ctx),
    segmentacoes:   getGroupedFunil('segmentacao',   ctx),
    qualwebn:       getGroupedFunil('qual_webn',     ctx),
    templates:      getGroupedFunil('template_name', ctx),
    transferencias: getTransferencias(ctx),
    custos:         getCustos(ctx),
    followups:      getFollowups(ctx),
    roi:            getRoi(ctx),
  };
}

function getAllCached(noCache) {
  if (!noCache) {
    const hit = cacheGet(CACHE_KEY);
    if (hit) {
      try {
        const obj = JSON.parse(hit);
        obj.cached = true;
        return obj;
      } catch (err) {
        // cache corrompido: ignora e regenera
      }
    }
  }
  const payload = getAll();
  payload.cached = false;
  try { cachePut(CACHE_KEY, JSON.stringify(payload)); } catch (err) {}
  return payload;
}

function limparCache() {
  try { cacheDelete(CACHE_KEY); } catch (err) {}
}

// O CacheService aceita no máximo ~100KB por chave, e o payload completo
// passa disso. Então fatiamos a string em pedaços e guardamos uma chave
// "_meta" com a quantidade de pedaços. Usamos 45.000 caracteres por
// pedaço porque acentos ocupam 2 bytes em UTF-8 — no pior caso, 90KB,
// ainda dentro do limite.
const CACHE_CHUNK_SIZE = 45000;
const CACHE_MAX_CHUNKS = 40; // ~1.8MB; acima disso desistimos de cachear

function cachePut(key, str) {
  const cache = CacheService.getScriptCache();
  const n = Math.ceil(str.length / CACHE_CHUNK_SIZE);
  if (n > CACHE_MAX_CHUNKS) return false; // grande demais: segue sem cache
  const parts = {};
  for (let i = 0; i < n; i++) {
    parts[key + '_' + i] = str.substring(i * CACHE_CHUNK_SIZE, (i + 1) * CACHE_CHUNK_SIZE);
  }
  parts[key + '_meta'] = String(n);
  cache.putAll(parts, CACHE_TTL);
  return true;
}

function cacheGet(key) {
  const cache = CacheService.getScriptCache();
  const meta = cache.get(key + '_meta');
  if (!meta) return null;
  const n = Number(meta);
  if (!n || n < 1) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  const got = cache.getAll(keys);
  let out = '';
  for (let i = 0; i < n; i++) {
    const part = got[key + '_' + i];
    // Pedaços podem expirar em momentos ligeiramente diferentes. Se
    // faltar qualquer um, o conteúdo estaria truncado → trata como miss.
    if (part === null || part === undefined) return null;
    out += part;
  }
  return out;
}

function cacheDelete(key) {
  const cache = CacheService.getScriptCache();
  const meta = cache.get(key + '_meta');
  const keys = [key + '_meta'];
  const n = Number(meta || 0);
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  cache.removeAll(keys);
}

// ───────────────────────────────────────────────
// CTX — leitura memoizada das abas
// ───────────────────────────────────────────────
// Todo builder recebe este ctx e pede as abas por ele. A primeira
// chamada lê da planilha; as seguintes devolvem o que já está em
// memória. É o que evita reler CHAMADO/CONEXÃO/LINK/VENDAS a cada
// getGroupedFunil().
function makeCtx() {
  const objCache   = {}; // nome da aba -> array de objetos
  const rawCache   = {}; // nome da aba -> matriz crua (getValues)
  const memoCache  = {}; // resultados derivados (dedupe, índices, etc.)
  return {
    rows: function (sheetName) {
      if (!(sheetName in objCache)) objCache[sheetName] = sheetToObjects(sheetName);
      return objCache[sheetName];
    },
    raw: function (sheetName) {
      if (!(sheetName in rawCache)) rawCache[sheetName] = sheetToRawValues(sheetName);
      return rawCache[sheetName];
    },
    memo: function (key, fn) {
      if (!(key in memoCache)) memoCache[key] = fn();
      return memoCache[key];
    },
  };
}

// ───────────────────────────────────────────────
// HELPERS GERAIS
// ───────────────────────────────────────────────
function sheetToRawValues(sheetName) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
}

// Pega todos os valores de uma aba como array de objetos, usando a
// primeira linha como cabeçalho. Ignora linhas totalmente vazias.
function sheetToObjects(sheetName) {
  const values = sheetToRawValues(sheetName);
  if (!values.length) return [];
  const headers = values[0].map(h => String(h || '').trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === '' || c === null)) continue;
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx]; });
    rows.push(obj);
  }
  return rows;
}

// Encontra o índice (1-indexado) de uma coluna pelo nome exato do cabeçalho.
function findColumn(headerRow, nomeExato) {
  const alvo = nomeExato.trim().toLowerCase();
  for (let i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i] || '').trim().toLowerCase() === alvo) return i + 1;
  }
  return 0;
}

// Converte célula de data (Date, string ISO, ou vazio) para 'yyyy-MM-dd'.
function toISODate(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return null;
    return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  }
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
  return null;
}

function toNumber(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function isTruthyFlag(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'verdadeiro' || s === 'sim' || s === '1';
}

function isFalsyFlagExplicit(v) {
  if (v === false) return true;
  if (v === '' || v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'false' || s === 'falso' || s === 'não' || s === 'nao' || s === '0';
}

function isRepeticao(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'repetição' || s === 'repeticao';
}

// Converte o valor de um campo para string "limpa" usada como chave.
// Trata 0 (número) corretamente — diferente de `v || ''`.
function fieldStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// ───────────────────────────────────────────────
// 1) MÉTRICAS DIÁRIAS — aba DADOS
// ───────────────────────────────────────────────
// Retorna: [{ date:'yyyy-MM-dd', mkt: {...} }, ...]
// "mkt" é o único segmento (esta automação não separa MKT/Comercial).
function getDadosDiarios(ctx) {
  const values = ctx.raw(SHEETS.DADOS);
  if (!values.length) return [];

  // Colunas esperadas (na ordem da planilha):
  // DATA, TOTAL, NÃO CHAMADOS, CHAMADOS, CONECTADOS, CONECTADOS ÚNICOS,
  // LINKS, VENDAS, SEM INTERESSE, TRANSFERENCIAS, TAXA DE CONEXÃO,
  // TAXA DE CONVERSÃO POR CONEXÃO, TAXA DE CONVERSÃO POR PROSPECTADOS,
  // VERIFICA TOTAL, MENSAGENS ENVIADAS, MENSAGENS ENTREGUES, LIDAS,
  // READ_RATE, ERROS
  //
  // Linhas com a MESMA data são somadas, para evitar datas duplicadas
  // na tabela (ex.: um processo insere linha zerada de manhã e outra
  // com os números reais mais tarde).
  const porData = {};
  const ordemDatas = [];
  function novoAcc() {
    return {
      total:0, naoChamados:0, chamados:0, conectados:0, links:0, vendas:0,
      semInteresse:0, transferencias:0,
      enviadas:0, entregues:0, lidas:0, erros:0,
      followupsMarcados:0,
      _hasEntrega:false,
    };
  }
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const date = toISODate(row[0]);
    if (!date) continue; // pula cabeçalhos de mês ("JUNHO/2026") e vazios
    if (!porData[date]) { porData[date] = novoAcc(); ordemDatas.push(date); }
    const acc = porData[date];
    acc.total          += toNumber(row[1]);
    acc.naoChamados    += toNumber(row[2]);
    acc.chamados       += toNumber(row[3]);
    acc.conectados     += toNumber(row[4]);
    acc.vendas         += toNumber(row[7]);
    acc.semInteresse   += toNumber(row[8]);
    acc.transferencias += toNumber(row[9]);
    // Datas anteriores ao início do rastreio de entrega (colunas O-S em
    // branco) não têm esse dado — vira null no JSON, não 0.
    if (row[14] !== '' && row[14] !== null && row[14] !== undefined) acc._hasEntrega = true;
    acc.enviadas       += toNumber(row[14]);
    acc.entregues      += toNumber(row[15]);
    acc.lidas          += toNumber(row[16]);
    acc.erros          += toNumber(row[18]);
  }

  // Links recalculados da aba LINK, deduplicados por telefone.
  linksDeduplicados(ctx).forEach(r => {
    const date = toISODate(r['dia_de_link']);
    if (!date) return;
    if (!porData[date]) { porData[date] = novoAcc(); ordemDatas.push(date); }
    porData[date].links += 1;
  });

  // Follow-ups marcados: contagem diária deduplicada por telefone.
  const fupsMarcados = countFollowupsMarcadosPorDia(ctx);
  Object.keys(fupsMarcados).forEach(date => {
    if (!porData[date]) { porData[date] = novoAcc(); ordemDatas.push(date); }
    porData[date].followupsMarcados = fupsMarcados[date];
  });

  return ordemDatas.sort().map(date => {
    const acc = porData[date];
    return {
      date,
      mkt: {
        total: acc.total, naoChamados: acc.naoChamados, chamados: acc.chamados,
        conectados: acc.conectados, links: acc.links, vendas: acc.vendas,
        semInteresse: acc.semInteresse, transferencias: acc.transferencias,
        enviadas:  acc._hasEntrega ? acc.enviadas  : null,
        entregues: acc._hasEntrega ? acc.entregues : null,
        lidas:     acc._hasEntrega ? acc.lidas     : null,
        erros:     acc._hasEntrega ? acc.erros     : null,
        followupsMarcados: acc.followupsMarcados,
      },
    };
  });
}

// ───────────────────────────────────────────────
// 1b) FOLLOW-UPS MARCADOS — aba "follow-ups_marcados"
// ───────────────────────────────────────────────
// Colunas: nome, telefone, momento_em_que_foi_marcado, data_de_retorno.
// { 'yyyy-MM-dd': contagem } com telefones únicos por dia.
function countFollowupsMarcadosPorDia(ctx) {
  return ctx.memo('fupsMarcadosPorDia', function () {
    const rows = ctx.rows(SHEETS.FOLLOWUPS_MARCADOS);
    const telefonesPorDia = {};
    const porData = {};
    rows.forEach(r => {
      const date = toISODate(r['momento_em_que_foi_marcado']);
      if (!date) return;
      const telefone = fieldStr(r['telefone']);
      if (!telefone) return;
      if (!telefonesPorDia[date]) telefonesPorDia[date] = {};
      if (telefonesPorDia[date][telefone]) return; // já contado nesse dia
      telefonesPorDia[date][telefone] = true;
      porData[date] = (porData[date] || 0) + 1;
    });
    return porData;
  });
}

// ───────────────────────────────────────────────
// 2) VENDAS — aba VENDAS
// ───────────────────────────────────────────────
// Colunas: nome, telefone, dia_de_venda, momento_de_venda, pipeline,
//          produto/tag, valor, venda
function getVendas(ctx) {
  const rows = ctx.rows(SHEETS.VENDAS);
  const out = [];
  rows.forEach(r => {
    // Ignora linhas explicitamente "falso"/"0" e as marcadas como
    // "Repetição" pelo botão ATUALIZAR VENDAS (reenvio de webhook).
    if (isFalsyFlagExplicit(r['venda']) || isRepeticao(r['venda'])) return;
    const date = toISODate(r['dia_de_venda']);
    if (!date) return;
    out.push({
      date,
      nome:     r['nome'] || '',
      telefone: r['telefone'] ? String(r['telefone']) : '',
      produto:  r['produto/tag'] || '',
      segmento: r['pipeline'] || '',
      valor:    toNumber(r['valor']),
    });
  });
  return out;
}

// ───────────────────────────────────────────────
// 3) FUNIS — por "segmentacao", "qual_webn" ou "template_name"
// ───────────────────────────────────────────────
// { "<valor>": [{date, chamados, conectados, links, vendas,
//                enviadas, entregues, lidas, erros}, ...] }
//
// Registros sem o campo preenchido NÃO entram (já estão no agregado
// geral, que vem da aba DADOS).
//
// GROUP_MIN_DATE: alguns campos só passaram a ser preenchidos a partir
// de certa data (ex.: "template_name" começou em 07/07/2026). Dados
// anteriores ficam incompletos para esse agrupamento e são ignorados.
const GROUP_MIN_DATE = {
  template_name: '2026-07-07',
};

function getGroupedFunil(fieldName, ctx) {
  const buckets = {};
  const minDate = GROUP_MIN_DATE[fieldName] || null;

  function ensure(valor, date) {
    if (minDate && date < minDate) return null;
    const key = fieldStr(valor);
    if (!key) return null; // sem o campo definido: não vira sub-aba
    if (!buckets[key]) buckets[key] = {};
    if (!buckets[key][date]) {
      buckets[key][date] = { chamados: 0, conectados: 0, links: 0, vendas: 0 };
      // enviadas/entregues/lidas só existem de verdade para template_name
      // (vêm da aba Custos). Para segmentacao/qual_webn ficam null no
      // retorno final, para o front mostrar "—" em vez de um 0 falso.
      if (fieldName === 'template_name') {
        buckets[key][date].enviadas  = 0;
        buckets[key][date].entregues = 0;
        buckets[key][date].lidas     = 0;
      }
    }
    return buckets[key][date];
  }

  ctx.rows(SHEETS.CHAMADO).forEach(r => {
    const date = toISODate(r['data']);
    if (!date) return;
    const b = ensure(r[fieldName], date);
    if (b) b.chamados += 1;
  });

  ctx.rows(SHEETS.CONEXAO).forEach(r => {
    const date = toISODate(r['criado_em'] || r['dia_de_conexao']);
    if (!date) return;
    const b = ensure(r[fieldName], date);
    if (b) b.conectados += 1;
  });

  // Links: cada telefone conta UMA vez (o registro mais antigo).
  linksDeduplicados(ctx).forEach(r => {
    const date = toISODate(r['dia_de_link']);
    if (!date) return;
    const b = ensure(r[fieldName], date);
    if (b) b.links += 1;
  });

  // A aba VENDAS não tem esses campos: descobrimos o valor de cada venda
  // cruzando pelo telefone com o registro de CHAMADO/CONEXÃO/LINK mais
  // próximo (na data da venda ou antes dela).
  const fieldIndex = buildTelefoneFieldIndex(fieldName, ctx);
  ctx.rows(SHEETS.VENDAS).forEach(r => {
    if (isFalsyFlagExplicit(r['venda']) || isRepeticao(r['venda'])) return;
    const date = toISODate(r['dia_de_venda']);
    if (!date) return;
    if (minDate && date < minDate) return;
    const valor = lookupFieldForVenda(fieldIndex, r['telefone'], date);
    const b = ensure(valor, date);
    if (b) b.vendas += 1;
  });

  // Enviadas/Entregues/Lidas — só para template_name, vindo da aba
  // Custos (categoria "Templates da Meta"), agregado por template/dia.
  if (fieldName === 'template_name') {
    ctx.rows(SHEETS.CUSTOS).forEach(r => {
      if (String(r['Categoria'] || '').trim() !== 'Templates da Meta') return;
      const date = toISODate(r['Data']);
      if (!date) return;
      const b = ensure(fieldStr(r['Descrição']), date);
      if (!b) return;
      b.enviadas  += toNumber(r['Enviados']);
      b.entregues += toNumber(r['Entregues']);
      b.lidas     += toNumber(r['Lidos']);
    });
  }

  const out = {};
  Object.keys(buckets).forEach(valor => {
    out[valor] = Object.keys(buckets[valor]).sort().map(date => {
      const b = buckets[valor][date];
      if (fieldName === 'template_name') {
        // Erros por template = Tentativas (chamados) − Entregues.
        return { date, ...b, erros: Math.max(0, b.chamados - b.entregues) };
      }
      return { date, ...b, enviadas: null, entregues: null, lidas: null, erros: null };
    });
  });
  return out;
}

// Uma linha por telefone na aba LINK — a de data mais antiga. Assim um
// lead que recebeu o link em mais de um dia (reenvio) conta uma vez só.
// Memoizado: os 3 getGroupedFunil() + getDadosDiarios() compartilham.
function linksDeduplicados(ctx) {
  return ctx.memo('linksDedup', function () {
    const porTelefone = {};
    ctx.rows(SHEETS.LINK).forEach(r => {
      const telefone = fieldStr(r['telefone']);
      if (!telefone) return;
      const date = toISODate(r['dia_de_link']);
      if (!date) return;
      const atual = porTelefone[telefone];
      if (!atual || date < atual.date) porTelefone[telefone] = { row: r, date };
    });
    return Object.keys(porTelefone).map(tel => porTelefone[tel].row);
  });
}

// Índice telefone → lista ordenada de {date, valor}, juntando CHAMADO
// (primeiro contato do lead), CONEXÃO e LINK, para cobrir o máximo de
// telefones. Memoizado por campo.
function buildTelefoneFieldIndex(fieldName, ctx) {
  return ctx.memo('telIndex:' + fieldName, function () {
    const index = {};

    function addFrom(sheetName, dateFieldNames) {
      ctx.rows(sheetName).forEach(r => {
        const telefone = fieldStr(r['telefone']);
        if (!telefone) return;
        const valor = fieldStr(r[fieldName]);
        if (!valor) return;
        let date = null;
        for (let i = 0; i < dateFieldNames.length; i++) {
          date = toISODate(r[dateFieldNames[i]]);
          if (date) break;
        }
        if (!date) return;
        if (!index[telefone]) index[telefone] = [];
        index[telefone].push({ date, valor });
      });
    }

    addFrom(SHEETS.CHAMADO, ['data']);
    addFrom(SHEETS.CONEXAO, ['criado_em', 'dia_de_conexao']);
    addFrom(SHEETS.LINK,    ['dia_de_link']);

    Object.keys(index).forEach(tel => {
      index[tel].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    });
    return index;
  });
}

// Para uma venda (telefone + data), acha o registro mais recente NA data
// da venda ou ANTES dela. Se não houver nenhum <= data da venda, usa o
// primeiro disponível para aquele telefone.
function lookupFieldForVenda(index, telefone, dataVenda) {
  const entries = index[fieldStr(telefone)];
  if (!entries || !entries.length) return '';
  let best = null;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].date <= dataVenda) best = entries[i];
    else break; // ordenado por data: pode parar
  }
  if (!best) best = entries[0];
  return best.valor;
}

// ───────────────────────────────────────────────
// 4) TRANSFERÊNCIAS — aba "Transferências Humano"
// ───────────────────────────────────────────────
// Colunas: nome, telefone, data, momento, pipeline, produto/tag,
//          motivo, mandou_suporte
function getTransferencias(ctx) {
  const out = [];
  ctx.rows(SHEETS.TRANSFERENCIAS).forEach(r => {
    const date = toISODate(r['data']);
    if (!date) return;
    out.push({
      date,
      nome:          r['nome'] || '',
      telefone:      r['telefone'] ? String(r['telefone']) : '',
      motivo:        r['motivo'] || '',
      mandouSuporte: isTruthyFlag(r['mandou_suporte']),
    });
  });
  return out;
}

// ───────────────────────────────────────────────
// 5) CUSTOS — aba Custos
// ───────────────────────────────────────────────
// Colunas: Data, Categoria, Descrição, Valor, Valor (dólar), Enviados,
//          Entregues, Lidos, Read_Rate (as 4 últimas só nas linhas de
//          Categoria "Templates da Meta" — ver getGroupedFunil()).
function getCustos(ctx) {
  const out = [];
  ctx.rows(SHEETS.CUSTOS).forEach(r => {
    const date = toISODate(r['Data']);
    if (!date) return;
    out.push({
      date,
      categoria: r['Categoria'] || 'Outros',
      descricao: r['Descrição'] || '',
      valor:     toNumber(r['Valor']),
    });
  });
  return out;
}

// ───────────────────────────────────────────────
// 5b) ROI — aba Config + VENDAS + Custos
// ───────────────────────────────────────────────
// Ver o comentário no topo do arquivo para a explicação completa das
// regras (FB/FL/COM/CR/CT/ROI) e do layout esperado da aba Config.
//
// Categorias reais da aba Custos e o bucket de custos_por_categoria
// para o qual cada uma é somada. "Comissões" NUNCA entra em nenhum
// bucket — vira o campo "comissao" (valor real lançado), e some do
// custos_registrados/custo_total para não contar duas vezes.
const CUSTO_CATEGORIA_BUCKET = {
  'templates da meta':       'templates',
  'meta':                    'templates',
  'tokens - openai':         'tokens',
  'tokens - openrouter':     'tokens',
  'openrouter':              'tokens',
  'implementação':           'implementacao',
  'implementacao':           'implementacao',
  'manutenção':               'salario', // é onde o custo de salário é lançado hoje
  'manutencao':               'salario',
};
const CUSTO_CATEGORIA_COMISSAO = 'comissões';

const ROI_DEFAULT_TAXA_LIQUIDO = 0.93;
const ROI_DEFAULT_FAIXAS = [
  { meta: 'Fraca',        piso: 0,     teto: 30000, percentual: 0.05 },
  { meta: 'Média fraca',  piso: 30000, teto: 50000, percentual: 0.06 },
  { meta: 'Média forte',  piso: 50000, teto: 65000, percentual: 0.07 },
  { meta: 'Forte',        piso: 65000, teto: null,  percentual: 0.08 },
];

// Lê a aba Config: colunas A:B = pares chave/valor (linha 1 é
// cabeçalho), colunas D:G = tabela de faixas (linha 1 é cabeçalho).
// Se a aba não existir, ou algum valor estiver ausente, cai nos
// padrões acima e loga um aviso — nunca quebra o payload inteiro por
// causa disso.
function getConfig(ctx) {
  return ctx.memo('config', function () {
    const raw = ctx.raw(SHEETS.CONFIG);
    if (!raw.length) {
      console.warn('Aba "Config" não encontrada ou vazia — usando taxa_liquido e faixas padrão.');
      return { taxaLiquido: ROI_DEFAULT_TAXA_LIQUIDO, faixas: ROI_DEFAULT_FAIXAS };
    }

    let taxaLiquido = null;
    for (let i = 1; i < raw.length; i++) {
      const chave = String(raw[i][0] || '').trim().toLowerCase();
      if (chave === 'taxa_liquido') { taxaLiquido = toNumber(raw[i][1]); break; }
    }
    if (!taxaLiquido) {
      console.warn('"taxa_liquido" ausente na aba Config — usando padrão 0,93.');
      taxaLiquido = ROI_DEFAULT_TAXA_LIQUIDO;
    }

    const faixas = [];
    for (let i = 1; i < raw.length; i++) {
      const row  = raw[i];
      const meta = String(row[3] || '').trim(); // coluna D
      if (!meta) continue;
      const piso       = toNumber(row[4]); // coluna E
      const tetoRaw    = row[5];           // coluna F
      const teto       = (tetoRaw === '' || tetoRaw === null || tetoRaw === undefined) ? null : toNumber(tetoRaw);
      const percentual = toNumber(row[6]); // coluna G
      faixas.push({ meta, piso, teto, percentual });
    }
    if (!faixas.length) {
      console.warn('Tabela de faixas ausente na aba Config — usando faixas padrão.');
      return { taxaLiquido, faixas: ROI_DEFAULT_FAIXAS };
    }

    faixas.sort((a, b) => a.piso - b.piso);
    return { taxaLiquido, faixas };
  });
}

// Escolhe a faixa cujo FL cai em [piso, teto). Teto vazio = infinito.
function findFaixa(faixas, fl) {
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i];
    if (fl >= f.piso && (f.teto === null || fl < f.teto)) return f;
  }
  return faixas[faixas.length - 1];
}

function novoBucketCusto() {
  return { templates: 0, tokens: 0, implementacao: 0, salario: 0, outros: 0 };
}

// 'yyyy-MM' do mês anterior ao informado (com rollover de ano: jan → dez do ano anterior).
function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function getRoi(ctx) {
  const { taxaLiquido, faixas } = getConfig(ctx);

  // FB por mês: soma de "valor" das vendas válidas (getVendas já exclui
  // "Repetição"/falsas), agrupado pelo mês de "dia_de_venda".
  const fbPorMes = {};
  getVendas(ctx).forEach(v => {
    const mes = v.date.slice(0, 7);
    fbPorMes[mes] = (fbPorMes[mes] || 0) + v.valor;
  });

  // CR por mês + breakdown por categoria + comissão REAL já lançada
  // (categoria "Comissões"), lidos direto da aba Custos (não reusa
  // getCustos() porque aqui precisamos separar "Comissões" do resto).
  const crPorMes = {};
  const bucketPorMes = {};
  const comissaoRealPorMes = {};
  let custosIgnorados = 0;

  ctx.rows(SHEETS.CUSTOS).forEach(r => {
    const date = toISODate(r['Data']);
    const valorRaw = r['Valor'];
    const temValor = valorRaw !== '' && valorRaw !== null && valorRaw !== undefined;
    if (!date || !temValor) { custosIgnorados++; return; }

    const valor = toNumber(valorRaw); // só BRL — "Valor (dólar)" não é usado
    const mes = date.slice(0, 7);
    const categoriaKey = String(r['Categoria'] || '').trim().toLowerCase();

    if (categoriaKey === CUSTO_CATEGORIA_COMISSAO) {
      // O pagamento sai por volta do dia 15 do mês SEGUINTE ao mês de
      // referência (ex.: lançamento em 17/08 é a comissão de JULHO).
      // Por isso a atribuímos ao mês anterior ao da data de lançamento.
      const mesReferencia = mesAnterior(mes);
      comissaoRealPorMes[mesReferencia] = (comissaoRealPorMes[mesReferencia] || 0) + valor;
      return; // não entra em CR — vira "comissao" direto
    }

    crPorMes[mes] = (crPorMes[mes] || 0) + valor;
    if (!bucketPorMes[mes]) bucketPorMes[mes] = novoBucketCusto();
    const bucket = CUSTO_CATEGORIA_BUCKET[categoriaKey] || 'outros';
    bucketPorMes[mes][bucket] += valor;
  });

  const mesAtual = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM');
  const todosMeses = new Set([
    ...Object.keys(fbPorMes),
    ...Object.keys(crPorMes),
    ...Object.keys(comissaoRealPorMes),
  ]);

  const meses = Array.from(todosMeses).sort().map(mes => {
    const fb = fbPorMes[mes] || 0;
    const fl = fb * taxaLiquido;
    const faixa = findFaixa(faixas, fl);
    const comissaoCalculada = fl * faixa.percentual;
    const comissaoLancada = comissaoRealPorMes[mes] !== undefined;
    const comissao = comissaoLancada ? comissaoRealPorMes[mes] : comissaoCalculada;

    const cr = crPorMes[mes] || 0;
    const ct = cr + comissao;
    const roiMultiplo   = ct > 0 ? fl / ct : null;
    const roiPercentual = ct > 0 ? (fl - ct) / ct : null;

    const idxFaixa = faixas.indexOf(faixa);
    const proximaFaixa = faixas[idxFaixa + 1] || null;
    const faltaProximaFaixa = proximaFaixa ? Math.max(0, proximaFaixa.piso - fl) : null;

    return {
      mes,
      faturamento_bruto:    fb,
      faturamento_liquido:  fl,
      faixa:                faixa.meta,
      percentual_comissao:  faixa.percentual,
      comissao,
      comissao_lancada:     comissaoLancada, // false = estimada por fórmula, true = valor real pago
      custos_registrados:   cr,
      custos_por_categoria: bucketPorMes[mes] || novoBucketCusto(),
      custo_total:          ct,
      roi_multiplo:         roiMultiplo,   // null quando custo_total = 0 (front mostra "—")
      roi_percentual:       roiPercentual, // null quando custo_total = 0
      proxima_faixa:        proximaFaixa ? proximaFaixa.meta : null,
      falta_proxima_faixa:  faltaProximaFaixa,
      em_andamento:         mes === mesAtual,
    };
  });

  return {
    config: { taxa_liquido: taxaLiquido },
    meses,
    custos_ignorados: custosIgnorados,
  };
}

// ───────────────────────────────────────────────
// 6) FOLLOW-UPS — aba "f-ups"
// ───────────────────────────────────────────────
// Colunas: nome, telefone, momento_de_fup, dia_de_fup, respondido,
//          f-up, horario_resposta. "f-up" = "1H30" | "10H" | "23H".
function getFollowups(ctx) {
  const out = [];
  ctx.rows(SHEETS.FOLLOWUPS).forEach(r => {
    const date = toISODate(r['dia_de_fup']);
    if (!date) return;
    out.push({
      date,
      nome:            r['nome'] || '',
      telefone:        r['telefone'] ? String(r['telefone']) : '',
      tipo:            String(r['f-up'] || '').trim().toUpperCase(),
      respondido:      isTruthyFlag(r['respondido']),
      horarioResposta: r['horario_resposta'] ? String(r['horario_resposta']) : null,
    });
  });
  return out;
}

// ───────────────────────────────────────────────
// 7) CLASSIFICAR VENDAS (botão "ATUALIZAR VENDAS" / chamada pelo n8n)
// ───────────────────────────────────────────────
// Para cada combinação de telefone + produto/tag (SEM considerar a
// data), marca o lançamento de MENOR valor como "Sim" e os demais como
// "Repetição" — mesmo em dias diferentes. Isso cobre reenvios de webhook
// que caem num dia diferente do lançamento original.
//
// Localiza as colunas pelo nome do cabeçalho, então continua funcionando
// se a aba VENDAS for reordenada. Linhas com telefone, produto/tag,
// dia_de_venda ou valor ausentes/inválidos ficam com "venda" em branco.
//
// LockService evita que duas execuções simultâneas (ex.: duas vendas
// chegando juntas pelo n8n) escrevam por cima uma da outra. Quem não
// pegar o lock em 15s desiste — sem problema, pois quem está com o lock
// processa a planilha inteira, inclusive a venda que acabou de entrar.
function classificarVendas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, msg: 'Outra classificação já está em andamento, tente novamente em alguns segundos.' };
  }

  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.VENDAS);
    if (!sh || sh.getLastRow() < 2) return { ok: true, msg: 'Nenhuma venda para processar.' };

    const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const colTelefone = findColumn(headerRow, 'telefone');
    const colProduto  = findColumn(headerRow, 'produto/tag');
    const colDia      = findColumn(headerRow, 'dia_de_venda');
    const colValor    = findColumn(headerRow, 'valor');
    const colVenda    = findColumn(headerRow, 'venda');

    const faltando = [];
    if (!colTelefone) faltando.push('telefone');
    if (!colProduto)  faltando.push('produto/tag');
    if (!colDia)      faltando.push('dia_de_venda');
    if (!colValor)    faltando.push('valor');
    if (!colVenda)    faltando.push('venda');
    if (faltando.length) {
      return { ok: false, msg: 'Coluna(s) não encontrada(s) na aba VENDAS: ' + faltando.join(', ') };
    }

    const numRows = sh.getLastRow() - 1;
    const dados = sh.getRange(2, 1, numRows, sh.getLastColumn()).getValues();

    const registros = {}; // "telefone|produto" → { menorValor, idxVencedor }
    const resultado = [];
    let contSim = 0, contRepeticao = 0, contIgnorados = 0;

    for (let i = 0; i < numRows; i++) {
      const row      = dados[i];
      const telefone = String(row[colTelefone - 1] || '').trim();
      const produto  = String(row[colProduto  - 1] || '').trim();
      const dataISO  = toISODate(row[colDia - 1]); // só validação
      const valor    = toNumber(row[colValor - 1]);

      if (!telefone || !produto || !dataISO || valor <= 0) {
        resultado.push(['']);
        contIgnorados++;
        continue;
      }

      const chave = telefone + '|' + produto;

      if (!(chave in registros)) {
        registros[chave] = { menorValor: valor, idxVencedor: i };
        resultado.push(['Sim']);
        contSim++;
      } else {
        const reg = registros[chave];
        if (valor < reg.menorValor) {
          // lançamento mais barato: vira o novo "Sim", o antigo vira "Repetição"
          resultado[reg.idxVencedor][0] = 'Repetição';
          contSim--; contRepeticao++;
          reg.menorValor  = valor;
          reg.idxVencedor = i;
          resultado.push(['Sim']);
          contSim++;
        } else {
          resultado.push(['Repetição']);
          contRepeticao++;
        }
      }
    }

    sh.getRange(2, colVenda, numRows, 1).setValues(resultado);

    return {
      ok: true,
      msg: `${numRows} vendas verificadas: ${contSim} marcadas como "Sim", ${contRepeticao} como "Repetição", ${contIgnorados} ignoradas (dados incompletos).`,
    };
  } finally {
    lock.releaseLock();
  }
}
