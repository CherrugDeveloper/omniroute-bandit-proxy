const API_BASE = 'http://127.0.0.1:20128/v1';

async function fetchStats() {
    try {
        console.log('Fetching dashboard stats...');
        const response = await fetch(`${API_BASE}/dashboard/stats`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const stats = await response.json();
        console.log('Dashboard Stats:', JSON.stringify(stats, null, 2));
    } catch (e) {
        console.error('Error fetching stats:', e.message);
    }
}

fetchStats();
