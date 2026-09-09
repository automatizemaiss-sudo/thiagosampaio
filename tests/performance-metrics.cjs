const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('performance.html', 'utf8');
const backend = fs.readFileSync('code.gs', 'utf8');
const context = vm.createContext({Session:{getScriptTimeZone:()=> 'America/Sao_Paulo'}});
vm.runInContext(backend, context);
vm.runInContext(`
const inbound = CONEXAO_NAO_ATRIBUIDO;
const tables = {
 [SHEETS.CHAMADO]: [{telefone:'1',data:'2026-09-01',waba:'A'}],
 [SHEETS.CONEXAO]: [
  {telefone:'1',criado_em:'2026-09-02',waba:'B'},
  {telefone:'2',criado_em:'2026-09-02',waba:'B',segmentacao:inbound},
  {telefone:'3',criado_em:'2026-09-02',waba:inbound}],
 [SHEETS.LINK]: [{telefone:'1',dia_de_link:'2026-09-03',waba:'B'}],
 [SHEETS.VENDAS]: [
  {telefone:'1',dia_de_venda:'2026-09-04',venda:true},
  {telefone:'1',dia_de_venda:'2026-08-30',venda:true}],
 [SHEETS.CUSTOS]: [{Data:'2026-09-02',Categoria:'Templates da Meta',WABA:'B',Enviados:10,Entregues:8}]
};
const ctx = {rows: key=>tables[key] || [], memo:(key,fn)=>fn()};
globalThis.result = getGroupedWaba(ctx);
globalThis.daily = countConexaoPorDia(ctx);
`, context);
assert.equal(context.result.B.find(r=>r.date==='2026-09-02').conectados,1);
assert.equal(context.result.B.find(r=>r.date==='2026-09-02').conectadosNaoAtribuidos,1);
assert.equal(context.result.B.find(r=>r.date==='2026-09-04').vendas,1);
assert.equal(context.result.A.some(r=>r.vendas>0),false);
assert.equal(context.daily['2026-09-02'].naoAtribuidos,2);
const metrics = html.slice(html.indexOf('function segData('),html.indexOf('function setDefaultDates('));
const front = vm.createContext({segmentacoesData:{},qualwebnData:{},rows:[{mkt:{conectados:179,conectadosNaoAtribuidos:5,chamados:1275,erros:243,entregues:1032,vendas:3}}]});
vm.runInContext(metrics+';globalThis.result=aggregates(rows);',front);
assert.equal(front.result.conectados,174);
assert.equal(front.result.conectadosNaoAtribuidos,5);
assert.equal(front.result.taxaConexao,179/1032*100);
assert.equal(front.result.convConexao,3/179*100);
const cardCode = html.slice(html.indexOf('function buildCard('),html.indexOf('async function fetchIaMsgs('));
front.document = {createElement:()=>({style:{}})};
vm.runInContext(cardCode+`;globalThis.card=buildCard({key:'erros',format:'num',label:'Erros'},result,false);`,front);
assert.match(front.card.innerHTML,/19\.1% das tentativas/);
vm.runInContext(`globalThis.card=buildCard({key:'erros',format:'num'}, {erros:0,chamados:0},false);`,front);
assert.doesNotMatch(front.card.innerHTML,/NaN|Infinity/);
assert.doesNotMatch(html,/key:'total'/);
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
console.log('PASS: inbound separation, preserved general rates, error percentage, zero denominator, WABA event attribution, no future sale attribution, syntax.');

front.rows[0].mkt.conectadosNaoAtribuidos=0;
front.rows[0].date='2026-09-09';
front.segmentacoesData={'lead não atribuído, não recebeu disparo ativamente':[{date:'2026-09-09',conectados:5}]};
front.qualwebnData=front.segmentacoesData;
vm.runInContext('globalThis.result=aggregates(rows)',front);
assert.equal(front.result.conectados,174);
assert.equal(front.result.conectadosNaoAtribuidos,5);
const countCode=html.slice(html.indexOf('function cfCount('),html.indexOf('function cfCount(')+150).split('\n}')[0]+'\n}';
assert.equal(vm.runInNewContext(countCode+';cfCount(3)'), '3');
const summary=html.slice(html.indexOf('function cfRenderSummary('),html.indexOf('function cfRenderBar('));
assert.doesNotMatch(summary,/aiCard|cfLoadAiMemory|Mensagens da IA/);
console.log('PASS: legacy payload inbound fallback without double counting; exact small counts; funnel without AI card.');

assert.equal(context.result.A.find(r=>r.date==='2026-09-01').chamados,1);
assert.equal(context.result.B.find(r=>r.date==='2026-09-03').links,1);
assert.equal(context.result.B.find(r=>r.date==='2026-09-02').entregues,8);
console.log('PASS: actual lowercase event headers and uppercase Custos header.');
