import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../bandit.db");

const db = new Database(dbPath, { readonly: true });
const catalog = db.prepare("SELECT * FROM catalog WHERE id LIKE '%nvidia%' OR provider LIKE '%nvidia%' LIMIT 20").all();
console.log(JSON.stringify(catalog, null, 2));
db.close();

const models = db.prepare("SELECT * FROM models WHERE id LIKE '%nvidia%' OR provider LIKE '%nvidia%' LIMIT 20").all();
console.log(JSON.stringify(models, null, 2));
