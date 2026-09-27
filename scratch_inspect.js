const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log("Tables in public schema:");
    console.log(tables.map(t => t.table_name).join(', '));
    
    try {
      const migrations = await prisma.$queryRaw`
        SELECT id, checksum, finished_at, migration_name, logs 
        FROM _prisma_migrations 
        ORDER BY started_at DESC 
        LIMIT 5
      `;
      console.log("\nLast 5 Migrations:");
      console.log(JSON.stringify(migrations, null, 2));
    } catch (e) {
      console.log("\nNo _prisma_migrations table found or error querying it:", e.message);
    }
    
    // Check columns on production_batches and batch_stages
    try {
      const batchCols = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'production_batches'
      `;
      console.log("\nColumns in production_batches:");
      console.log(batchCols.map(c => c.column_name).join(', '));
    } catch (e) {
      // ignore
    }
    
    try {
      const stageCols = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'batch_stages'
      `;
      console.log("\nColumns in batch_stages:");
      console.log(stageCols.map(c => c.column_name).join(', '));
    } catch (e) {
      // ignore
    }

  } catch (err) {
    console.error("Error connecting to database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
