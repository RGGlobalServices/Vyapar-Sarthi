// Simulate the client streaming loop + server create-or-increment ImportLog.
const DB_BATCH_SIZE = 100;
const rows = Array.from({length: 250}, (_, i) => ({ id: i+1 }));

// Fake server: one durable job, increments counts; created = rows in batch.
let job = null;
function serverExecute({ data, totalRows, importLogId }, failThisCall=false) {
  if (failThisCall) throw new Error('network blip');
  if (!importLogId) { job = { id: 'LOG1', totalRows, imported: 0, skipped: 0 }; importLogId = job.id; }
  job.imported += data.length;
  return { summary: { created: data.length, updated: 0, skipped: 0, rowErrors: [], importLogId } };
}

function runStream(startOffset, existingLogId, failAtOffset=-1) {
  let offset = startOffset, importLogId = existingLogId;
  const acc = { created: 0 };
  let checkpoint = null;
  for (let b = Math.floor(offset/DB_BATCH_SIZE); offset < rows.length; b++) {
    const slice = rows.slice(offset, offset+DB_BATCH_SIZE);
    let res;
    for (let attempt=0; attempt<2 && !res; attempt++) {
      try { res = serverExecute({ data: slice, totalRows: rows.length, importLogId }, offset===failAtOffset); }
      catch(e){ if(attempt===1){ checkpoint = { importLogId, offset }; return { interrupted:true, checkpoint, acc, jobImported: job?.imported }; } }
    }
    importLogId = res.summary.importLogId;
    acc.created += res.summary.created;
    offset = Math.min(offset+DB_BATCH_SIZE, rows.length);
    checkpoint = { importLogId, offset };
  }
  return { interrupted:false, checkpoint, acc, jobImported: job.imported };
}

// Run 1: fail at offset 100 (2nd batch) after retry
const r1 = runStream(0, null, 100);
console.log('Run1 (fails at batch 2):', JSON.stringify(r1));
// Resume from checkpoint — never restart at row 0
const r2 = runStream(r1.checkpoint.offset, r1.checkpoint.importLogId);
console.log('Run2 (resume):', JSON.stringify(r2));
const totalImported = job.imported;
console.log(`\nDurable job imported total: ${totalImported} (expected 250) ${totalImported===250?'PASS':'FAIL'}`);
console.log(`No restart from 0 on resume: ${r2.acc.created===150 && r1.acc.created===100 ? 'PASS (100 + 150 = 250, no re-import)' : 'FAIL'}`);
