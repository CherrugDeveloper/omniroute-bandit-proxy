import Database from "better-sqlite3";
const db = new Database(process.env.DATABASE_PATH || "bandit.db");

// Count total models and permanent bans
const totalModels = db.prepare("SELECT COUNT(*) as count FROM models").get().count;
const permanentBans = db.prepare("SELECT COUNT(*) as count FROM models WHERE permanent = 1").get().count;

console.log(`Total models: ${totalModels}`);
console.log(`Current permanent bans: ${permanentBans}`);

// Fix: Reset permanent ban status for models with high failure counts
// If consecutive_critical_failures is high but we want to recover, we can reset permanent=0
// and perhaps reset consecutive_critical_failures to a lower value (e.g., 0)
const resetResult = db.prepare(`
    UPDATE models 
    SET permanent = 0, consecutive_critical_failures = 0, banned_since = NULL 
    WHERE permanent = 1
`).run();

console.log(`Reset ${resetResult.changes} models from permanent ban.`);

const newPermanentBans = db.prepare("SELECT COUNT(*) as count FROM models WHERE permanent = 1").get().count;
console.log(`New permanent ban count: ${newPermanentBans}`);
