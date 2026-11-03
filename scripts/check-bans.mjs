import Database from 'better-sqlite3';
const db = new Database('./bandit.db');
const bannedModels = db.prepare("SELECT id, permanent, banned_since FROM models WHERE permanent = 1").all();
console.log(bannedModels);
