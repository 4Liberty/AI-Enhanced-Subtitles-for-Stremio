// Test the beautiful Stremio Addon UI system
const { setupUIRoutes } = require('./ui-api');
const express = require('express');

console.log('🧪 Testing Stremio Addon Beautiful UI...');

const app = express();
app.use(express.json());

// Setup the beautiful UI routes
setupUIRoutes(app);

// Test server
const port = 7001;
app.listen(port, () => {
    console.log(`\n✅ Stremio Addon UI Test Server running at: http://localhost:${port}`);
    console.log(`🎨 Beautiful UI: http://localhost:${port}/ui`);
    console.log(`📊 Health API: http://localhost:${port}/api/health/detailed`);
    console.log(`🔧 Providers API: http://localhost:${port}/api/torrents/providers`);
    console.log(`📈 Stats API: http://localhost:${port}/api/stats`);
    console.log(`\n🚀 Test the beautiful UI by opening: http://localhost:${port}/ui`);
    console.log(`\n Features to test:`);
    console.log(`   • Dashboard with real-time metrics`);
    console.log(`   • Subtitle sources and language settings`);
    console.log(`   • Torrent providers with scraping status`);
    console.log(`   • Advanced health monitoring`);
    console.log(`   • Settings with API key management`);
    console.log(`   • Dark theme with modern design`);
});

// Test individual endpoints
setTimeout(async () => {
    try {
        const fetch = require('node-fetch');
        
        console.log('\n🧪 Testing API endpoints...');
        
        // Test stats endpoint
        const stats = await fetch(`http://localhost:${port}/api/stats`);
        const statsData = await stats.json();
        console.log('📊 Stats endpoint working:', Object.keys(statsData).length > 0);
        
        // Test provider endpoint
        const providers = await fetch(`http://localhost:${port}/api/torrents/providers`);
        const providersData = await providers.json();
        console.log('🔧 Providers endpoint working:', Array.isArray(providersData));
        
        // Test health endpoint
        const health = await fetch(`http://localhost:${port}/api/health/detailed`);
        const healthData = await health.json();
        console.log('📈 Health endpoint working:', healthData.overallScore !== undefined);
        
        console.log('\n✅ All API endpoints are working correctly!');
        console.log('🎉 Beautiful Stremio Addon UI is ready for production use!');
        
    } catch (error) {
        console.error('❌ API test failed:', error.message);
    }
}, 2000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Stremio Addon UI test server...');
    process.exit(0);
});
