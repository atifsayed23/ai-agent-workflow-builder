const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

async function runMigrationTest() {
  console.log('Initializing PostgreSQL database engine...');
  const db = new PGlite();

  const migrationSql = fs.readFileSync(
    path.join(__dirname, '../hasura/migrations/001_init_schema.sql'),
    'utf8'
  );

  console.log('Running 001_init_schema.sql migration on real PostgreSQL...');
  await db.exec(migrationSql);
  console.log('Migration executed successfully!');

  // Verify created tables
  const tablesResult = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  console.log('\nVerified PostgreSQL Tables in Schema:');
  console.table(tablesResult.rows);

  // Verify created views
  const viewsResult = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'VIEW';
  `);

  console.log('\nVerified PostgreSQL Views:');
  console.table(viewsResult.rows);
}

runMigrationTest().catch((err) => {
  console.error('Migration execution failed:', err);
  process.exit(1);
});
