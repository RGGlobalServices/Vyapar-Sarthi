const LINES_PER_CHUNK = 60, MAX_CHUNKS = 400;
function chunkText(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim()!=='');
  if (lines.length <= LINES_PER_CHUNK) return lines.length?[lines.join('\n')]:[];
  const headerLine = lines[0]; const chunks=[];
  for (let i=1;i<lines.length && chunks.length<MAX_CHUNKS;i+=LINES_PER_CHUNK){
    chunks.push(`${headerLine}\n${lines.slice(i,i+LINES_PER_CHUNK).join('\n')}`);
  }
  return chunks;
}
// 80-row sales file
const header='ProductName,Qty,Price,Customer,Invoice';
const rows=Array.from({length:80},(_,i)=>`Product ${i+1},${(i%5)+1},${(i+1)*10},Customer ${i+1},INV-300`);
const text=[header,...rows].join('\n');
// Simulate AI: extract each chunk's data rows into item objects
const chunks=chunkText(text);
let items=[];
chunks.forEach(c=>{
  c.split('\n').slice(1).forEach(l=>{ const [productName,quantity,price,customer,invoiceNumber]=l.split(',');
    items.push({productName,quantity,sellingPrice:price,customerName:customer,invoiceNumber}); });
});
// Simulate the OLD-bug duplication: pretend vision re-emitted first 61 rows again
const extra = items.slice(0,61).map(x=>({...x}));
const withDupes=[...items,...extra];
// full-row dedup
const norm=(it)=>Object.keys(it).sort().map(k=>`${k.toLowerCase()}=${String(it[k]??'').trim().toLowerCase()}`).join('|');
const seen=new Set(); const deduped=withDupes.filter(it=>{const k=norm(it); if(seen.has(k))return false; seen.add(k); return true;});
console.log(`chunks: ${chunks.length}`);
console.log(`clean extraction (no header dup): ${items.length} rows (expected 80)`);
console.log(`with simulated 61 exact dupes: ${withDupes.length}`);
console.log(`after full-row dedup: ${deduped.length} (expected 80) ${deduped.length===80?'PASS':'FAIL'}`);
