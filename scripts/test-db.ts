
const { db } = require('../lib/db.cjs');

async function testDbConnection() {
  console.log('Attempting to connect to the database and fetch prompt types...');

  try {
    const startTime = Date.now();
    // A simple query to get a few prompt types
    const { rows } = await db.execute('SELECT id, name, description FROM prompt_types LIMIT 5');
    const endTime = Date.now();

    console.log(`✅ Connection successful! Query took ${endTime - startTime}ms.`);

    if (rows.length > 0) {
      console.log('Found a total of', rows.length, 'prompt types. Showing up to 5:');
      console.table(rows);
    } else {
      console.log('⚠️  Query executed successfully, but no prompt types were found in the database.');
      console.log('   Please ensure the `prompt_types` table is populated.');
    }

  } catch (error) {
    console.error('❌ Database connection or query failed:');
    console.error(error);
    process.exit(1); // Exit with an error code
  } finally {
    console.log('DB test script finished.');
  }
}

testDbConnection();
