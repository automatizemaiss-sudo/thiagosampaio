// Same segmentation as the supplied n8n expression. Markdown fences omitted.
// Memory metric: split with this exact rule, then discard whitespace-only parts.
// Delivery confirmation is not required.
function splitAiMessages(output) {
  const partes = Array.isArray(output) ? output : (output || '').split(/\n|\n/);
  const MIN = 3;
  const ITEM = /^\s*(?:\p{Extended_Pictographic}|[0-9#*]\uFE0F?\u20E3)/u;
  const saida = [];
  let bloco = [], vazias = [];
  const fechar = () => {
    if (bloco.length >= MIN) saida.push(bloco.map(l => l.trim()).join('\n'));
    else saida.push(...bloco);
    bloco = [];
    saida.push(...vazias);
    vazias = [];
  };
  for (const p of partes) {
    const t = String(p);
    if (t.trim().length > 2 && ITEM.test(t)) { bloco.push(t); vazias = []; continue; }
    if (bloco.length && !t.trim()) { vazias.push(p); continue; }
    fechar();
    saida.push(p);
  }
  fechar();
  return saida;
}
module.exports = { splitAiMessages };
