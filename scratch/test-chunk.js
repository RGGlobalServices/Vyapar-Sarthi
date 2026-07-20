const LINES_PER_CHUNK = 60, HEADER_CONTEXT = 6, MAX_CHUNKS = 400;
function chunkText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length <= LINES_PER_CHUNK) return lines.length ? [lines.join('\n')] : [];
  const headerCtx = lines.slice(0, HEADER_CONTEXT).join('\n');
  const chunks = [];
  for (let i = HEADER_CONTEXT; i < lines.length && chunks.length < MAX_CHUNKS; i += LINES_PER_CHUNK) {
    const body = lines.slice(i, i + LINES_PER_CHUNK).join('\n');
    chunks.push(`${headerCtx}\n${body}`);
  }
  return chunks;
}
for (const N of [14, 57, 145, 500, 2000]) {
  const lines = ['ProductName,Qty,Price', ...Array.from({length: N}, (_, i) => `Product ${i+1},${i+1},${(i+1)*10}`)];
  const text = lines.join('\n');
  const chunks = chunkText(text);
  // Count how many unique product rows appear across all chunk BODIES (excluding repeated header context)
  const seen = new Set();
  chunks.forEach(c => {
    const cl = c.split('\n').slice(HEADER_CONTEXT); // drop repeated header context
    cl.forEach(l => { const m = l.match(/^Product (\d+),/); if (m) seen.add(Number(m[1])); });
  });
  // Also account for product rows that fell within the header-context window (first HEADER_CONTEXT lines)
  lines.slice(0, HEADER_CONTEXT).forEach(l => { const m = l.match(/^Product (\d+),/); if (m) seen.add(Number(m[1])); });
  const covered = seen.size;
  console.log(`${String(N).padStart(4)} rows -> ${chunks.length} chunk(s), unique product rows covered: ${covered}/${N} ${covered===N?'PASS':'FAIL'}`);
}
