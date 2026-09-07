const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('performance.html','utf8');
const code=html.slice(html.indexOf('function splitAiMessages('),html.indexOf('function cfRenderSummary('));
(async()=>{
 const queries=[];
 const ctx=vm.createContext({cfOrigem:'principal',cfRangeFrom:'2026-08-27',cfRangeTo:'2026-09-07',document:{getElementById:()=>null},sbFetch:async query=>{
  queries.push(query);
  return query.startsWith('clara_etapas_cache') ? [{telefone_chave:'1112345678'},{telefone_chave:'1112345678'}] : [{id:1,message:{type:'ai',content:'Olá\n✅ Um\n✅ Dois\n✅ Três\n\nFim'}}];
 }});
 vm.runInContext(code,ctx);
 const result=()=>vm.runInContext('cfAiMemoryTotals.get(cfAiMemoryKey())',ctx);
 await vm.runInContext('cfLoadAiMemory()',ctx);
 assert.equal(result().total,3);
 assert.equal(queries.length,2);
 assert(queries[0].includes('origem=eq.principal&dia=gte.2026-08-27&dia=lte.2026-09-07'));
 assert(queries[1].includes('message->>type=eq.ai'));
 await vm.runInContext('cfLoadAiMemory()',ctx); assert.equal(queries.length,2);
 ctx.cfOrigem='presente_gratuito'; ctx.sbFetch=async()=>{throw Error('offline')};
 await vm.runInContext('cfLoadAiMemory()',ctx);assert.equal(result().status,'error');assert.equal(result().total,undefined);
 ctx.sbFetch=async()=>[]; await vm.runInContext('cfLoadAiMemory(true)',ctx);assert.equal(result().total,0);
 let release;ctx.cfOrigem='principal';ctx.sbFetch=()=>new Promise(resolve=>{release=resolve});
 const pending=vm.runInContext('cfLoadAiMemory(true)',ctx);
 ctx.cfOrigem='presente_gratuito';release([]);await pending;assert.equal(result().total,0);
 console.log('PASS: cohort query, AI-only, message count, caching, origin isolation, error distinct from zero, retry, stale result isolation.');
})();
