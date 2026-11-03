import Database from 'better-sqlite3';
const db = new Database('./bandit.db');
const columns = db.pragma("table_info(models)");
console.log(columns.map(c => c.name));
