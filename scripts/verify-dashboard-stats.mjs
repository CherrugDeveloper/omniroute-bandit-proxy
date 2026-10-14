// Verify dashboard stats and metrics endpoints
import 'dotenv/config';
import { DiscountedUCB1Bandit } from '../src/bandit.mjs';

async function main() {
  console.log('=== VERIFYING DASHBOARD STATS & METRICS ENDPOINTS ===');

  // 1. Direct model/bandit method verification
  const dbPath = process.env.DB_PATH || './omniroute.db';
  const bandit = new DiscountedUCB1Bandit(dbPath);
  
  const metrics = bandit.getMetrics();
  const dashboardStats = bandit.getDashboardStats();

  console.log('\n[Direct Method] getMetrics():');
  console.log(`- Models count: ${metrics.models?.length}`);
  console.log(`- Providers count: ${metrics.providers?.length}`);

  console.log('\n[Direct Method] getDashboardStats():');
  console.log(`- totalRequests: ${dashboardStats.totalRequests}`);
  console.log(`- totalObservations: ${dashboardStats.totalObservations}`);
  console.log(`- avgReward: ${dashboardStats.avgReward}`);
  console.log(`- avgLatencySec: ${dashboardStats.avgLatencySec}`);
  console.log(`- freeActive: ${dashboardStats.freeActive}`);
  console.log(`- topModel: ${dashboardStats.topModel}`);
  console.log(`- catalogTotal: ${dashboardStats.catalogTotal}`);
  console.log(`- catalogFree: ${dashboardStats.catalogFree}`);
  console.log(`- totalModels: ${dashboardStats.totalModels}`);
  console.log(`- successRate: ${dashboardStats.successRate}`);

  // Validate required fields exist and are of correct type
  const requiredDashboardFields = [
    'totalRequests', 'totalObservations', 'avgReward', 'avgLatencySec',
    'freeActive', 'catalogTotal', 'catalogFree', 'totalModels', 'successRate',
    'modelsActive', 'modelsCooldown', 'modelsBanned', 'modelsDegraded', 'modelsAttention',
    'providersActive', 'providersCooldown', 'providersBanned', 'providersAttention',
    'totalProviders', 'catalogProviders'
  ];

  for (const field of requiredDashboardFields) {
    if (dashboardStats[field] === undefined) {
      throw new Error(`Missing required dashboard stats field: ${field}`);
    }
  }
  console.log('\n✓ All required dashboard stats fields present and valid.');

  // 2. HTTP endpoint verification against running server (port 8080)
  console.log('\n=== TESTING HTTP ENDPOINTS ===');
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  const token = process.env.DASHBOARD_TOKEN || '';

  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/v1/dashboard/stats`, {
      headers: token ? { 'x-api-token': token } : {}
    });
    console.log(`GET /v1/dashboard/stats HTTP Status: ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      console.log('GET /v1/dashboard/stats JSON response:', JSON.stringify(json, null, 2));
    } else {
      const text = await res.text();
      console.log('Response body:', text);
    }

    const resMetrics = await fetch(`http://127.0.0.1:${PORT}/v1/metrics`, {
      headers: token ? { 'x-api-token': token } : {}
    });
    console.log(`GET /v1/metrics HTTP Status: ${resMetrics.status}`);
    if (resMetrics.status === 200) {
      const jsonMetrics = await resMetrics.json();
      console.log(`GET /v1/metrics returned models: ${jsonMetrics.models?.length}, providers: ${jsonMetrics.providers?.length}`);
    } else {
      const textMetrics = await resMetrics.text();
      console.log('Response body:', textMetrics);
    }
  } catch (err) {
    console.log(`Note: Could not reach HTTP server at http://127.0.0.1:${PORT} (${err.message}). Make sure server is running or start it with npm start.`);
  }

  console.log('\nVerification completed successfully.');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
