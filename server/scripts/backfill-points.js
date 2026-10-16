require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const pool = require("../db");
const { awardPoints } = require("../lib/points");

(async () => {
  const { rows } = await pool.query(
    "SELECT id FROM attempts WHERE status = 'submitted' ORDER BY submitted_at, id"
  );
  let awarded = 0;
  for (const r of rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (await awardPoints(client, r.id)) awarded++;
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  console.log(`Awarded points for ${awarded} of ${rows.length} submitted attempts`);
  await pool.end();
})();
