import Database from "better-sqlite3";
const db = Database("bandit.db");

const stmt = db.prepare("UPDATE catalog SET supports_vision = 1 WHERE id LIKE ? OR id LIKE ?");
const info = stmt.run("%vision%", "%image%");

console.log("Updated rows:", info.changes);
