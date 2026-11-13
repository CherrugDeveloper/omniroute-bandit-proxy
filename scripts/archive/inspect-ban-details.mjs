import Database from "better-sqlite3";
const db = new Database(process.env.DATABASE_PATH || "bandit.db");

// Look at a sample of banned models to see their 'consecutive_critical_failures' and 'banned_since'
const sampleBanned = db.prepare("SELECT id, provider, banned_since, consecutive_critical_failures FROM models WHERE permanent = 1 LIMIT 10").all();
console.log("Sample banned models:", JSON.stringify(sampleBanned, null, 2));

// Check if there are models with permanent=1 but no recent failure/banned_since
const suspiciousBans = db.prepare("SELECT COUNT(*) as count FROM models WHERE permanent = 1 AND banned_since IS NULL").get().count;
console.log(`Models with permanent=1 but NULL banned_since: ${suspiciousBans}`);

// Group bans by provider to see if it's a provider-level issue
const bansByProvider = db.prepare("SELECT provider, COUNT(*) as count FROM models WHERE permanent = 1 GROUP BY provider ORDER BY count DESC").all();
console.log("Bans by provider:", JSON.stringify(bansByProvider, null, 2));
