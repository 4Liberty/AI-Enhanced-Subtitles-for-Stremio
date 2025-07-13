// Simple test to verify subtitle endpoints are working
const fetch = require('node-fetch');

async function testSubtitleEndpoints() {
    const baseUrl = 'http://localhost:7000';
    const testMovieId = 'tt0111161'; // The Shawshank Redemption
    
    console.log('Testing subtitle endpoints...');
    
    try {
        // Test 1: Manifest
        console.log('\n1. Testing manifest endpoint...');
        const manifestRes = await fetch(`${baseUrl}/manifest.json`);
        const manifest = await manifestRes.json();
        console.log('Manifest resources:', manifest.resources);
        console.log('Manifest subtitleLanguages:', manifest.subtitleLanguages);
        
        // Test 2: Health check
        console.log('\n2. Testing health endpoint...');
        const healthRes = await fetch(`${baseUrl}/health`);
        const health = await healthRes.json();
        console.log('Health check:', health);
        
        // Test 3: Subtitle endpoint
        console.log('\n3. Testing subtitle endpoint...');
        const subtitleRes = await fetch(`${baseUrl}/subtitles/movie/${testMovieId}.json`);
        const subtitles = await subtitleRes.json();
        console.log('Subtitle response:', JSON.stringify(subtitles, null, 2));
        
        // Test 4: Stream endpoint (for pre-caching)
        console.log('\n4. Testing stream endpoint...');
        const streamRes = await fetch(`${baseUrl}/stream/movie/${testMovieId}.json`);
        const streams = await streamRes.json();
        console.log('Stream response:', JSON.stringify(streams, null, 2));
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testSubtitleEndpoints();
