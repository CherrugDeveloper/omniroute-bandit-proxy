import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../bandit.db");

const db = new Database(dbPath, { readonly: true });
const catalog = db.prepare("SELECT * FROM catalog LIMIT 10").all();
console.log(JSON.stringify(catalog, null, 2));
db.close();
