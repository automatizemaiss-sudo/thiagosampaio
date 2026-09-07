const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {splitAiMessages: split} = require('../artifacts/ia-message-parts.cjs');
assert.deepEqual(split('Olá\nTudo bem?'), ['Olá','Tudo bem?']);
assert.deepEqual(split('✅ Um\n✅ Dois'), ['✅ Um','✅ Dois']);
assert.deepEqual(split('Olá\n✅ Um\n✅ Dois\n✅ Três\nFim'), ['Olá','✅ Um\n✅ Dois\n✅ Três','Fim']);
assert.equal(split('1️⃣ Um\n2️⃣ Dois\n3️⃣ Três').length, 1);
assert.equal(split('- Um\n- Dois\n- Três').length, 3);
assert.deepEqual(split(['Olá\nTudo bem?']), ['Olá\nTudo bem?']);
assert.deepEqual(split('a\n\nb'), ['a','','b']);
assert.deepEqual(split(''), ['']); // Candidate, not an actual sent message.
assert.deepEqual(split('a\\nb'), ['a\\nb']); // Literal backslash-n is not LF.
assert.deepEqual(split('a/nb'), ['a/nb']);
assert.deepEqual(split('✅ Um\n\n✅ Dois\n✅ Três'), ['✅ Um\n✅ Dois\n✅ Três']);
const html = fs.readFileSync('performance.html','utf8');
const fn = html.slice(html.indexOf('function splitAiMessages('), html.indexOf('const cfAiMemoryTotals'));
const count = rows => vm.runInNewContext(fn+';cfMemoryCount(rows)', {rows});
const row = (id, type, content) => ({id, message:{type,content}});
assert.equal(count([row(1,'ai','Olá\nTudo bem?'),row(2,'human','Oi'),row(3,'ai','✅ Um\n✅ Dois\n✅ Três')]),3);
assert.equal(count([row(1,'ai','a\n\nb'),row(1,'ai','a\n\nb'),row(2,'ai','  ')]),2);
assert.equal(count([]),0);
assert.throws(()=>count([row(1,'ai',{})]),/Formato/);
assert.equal(vm.runInNewContext(fn+";cfMemorySessions('11912345678').includes('+5511912345678')"),true);
assert.equal(vm.runInNewContext(fn+";cfMemorySessions('1112345678').includes('+5511912345678')"),true);
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
console.log('PASS: segmentation, emoji minimum, keycaps, arrays, blanks, literal separators, origin/day aggregation, no cumulative duplication, zero and unavailable, syntax.');
