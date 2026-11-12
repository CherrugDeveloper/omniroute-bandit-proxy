import Database from "better-sqlite3";
const db = new Database(process.env.DATABASE_PATH || "bandit.db");

const totalModels = db.prepare("SELECT COUNT(*) as count FROM models").get().count;
const permanentBans = db.prepare("SELECT COUNT(*) as count FROM models WHERE permanent = 1").get().count;

console.log(`Total models in database: ${totalModels}`);
console.log(`Models with permanent=1: ${permanentBans}`);
