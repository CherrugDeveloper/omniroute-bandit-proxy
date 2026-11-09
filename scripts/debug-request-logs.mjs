#!/usr/bin/env node
import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.join(process.cwd(), "bandit.db");
const db = new Database(dbPath, { readonly: true });

console.log(`Checking request_logs in ${dbPath}`);
try {
  const count = db.prepare("SELECT COUNT(*) as count FROM request_logs").get();
  console.log(`request_logs count: ${JSON.stringify(count)}`);
  
  // Use correct column names: started_at, ended_at, status_code, error_message, model, provider
  const recent = db.prepare("SELECT id, started_at, ended_at, status_code, error_message, model, provider FROM request_logs ORDER BY started_at DESC LIMIT 5").all();
  console.log(`Last 5 entries (by started_at): ${JSON.stringify(recent, null, 2)}`);
  
  // Also show stats
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as with_errors,
      COUNT(DISTINCT model) as unique_models,
      COUNT(DISTINCT provider) as unique_providers
    FROM request_logs
  `).get();
  console.log(`Stats: ${JSON.stringify(stats, null, 2)}`);
  
  // Show recent error entries
  const errors = db.prepare(`
    SELECT id, started_at, ended_at, status_code, model, provider 
    FROM request_logs 
    WHERE status_code >= 400 
    ORDER BY started_at DESC 
    LIMIT 10
  `).all();
  console.log(`Recent error entries: ${JSON.stringify(errors, null, 2)}`);
} catch (e) {
  console.error("Error querying request_logs:", e);
} finally {
  db.close();
}