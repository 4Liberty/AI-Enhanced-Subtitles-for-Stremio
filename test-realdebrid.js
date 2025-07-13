// Test script for Real-Debrid integration
const { searchRealDebridTorrents, checkRealDebridInstantAvailability, generateRealDebridStreams, generateSampleRealDebridStreams, getMovieMetadata, searchYTSTorrents } = require('./lib/realDebridSearch');

async function testRealDebridFunctionality() {
    console.log('='.repeat(60));
    console.log('🔍 TESTING REAL-DEBRID INTEGRATION');
    console.log('='.repeat(60));
    
    // Test movie ID (The Matrix)
    const movieId = 'tt0133093';
    
    console.log(`\n📋 Testing with movie ID: ${movieId}`);
    
    // Test 1: Check API Keys
    const hasRealDebridKey = !!process.env.REAL_DEBRID_API_KEY;
    const hasTmdbKey = !!process.env.TMDB_API_KEY;
    
    console.log(`\n🔑 API Key Status:`);
    console.log(`   Real-Debrid API Key: ${hasRealDebridKey ? '✅ Available' : '❌ Missing'}`);
    console.log(`   TMDB API Key: ${hasTmdbKey ? '✅ Available' : '❌ Missing'}`);
    
    if (!hasRealDebridKey) {
        console.log(`\n⚠️  WITHOUT REAL-DEBRID API KEY:`);
        console.log(`   - Only sample/demo streams will be shown`);
        console.log(`   - No real torrent searching`);
        console.log(`   - No actual cached content checking`);
        console.log(`\n📌 To get Real-Debrid API key: https://real-debrid.com/api`);
    }
    
    try {
        // Test 2: Movie Metadata
        console.log(`\n🎬 Testing Movie Metadata...`);
        const movieData = await getMovieMetadata(movieId);
        if (movieData) {
            console.log(`   ✅ Movie: ${movieData.title} (${movieData.year})`);
        } else {
            console.log(`   ❌ Could not fetch movie metadata`);
        }
        
        // Test 3: YTS Torrent Search (Public API)
        console.log(`\n🌐 Testing YTS Torrent Search (Public API)...`);
        const ytsResults = await searchYTSTorrents(movieId, movieData);
        if (ytsResults && ytsResults.length > 0) {
            console.log(`   ✅ Found ${ytsResults.length} YTS torrents:`);
            ytsResults.slice(0, 3).forEach(t => {
                console.log(`      - ${t.title} (${t.quality}, ${t.seeds} seeds)`);
            });
        } else {
            console.log(`   ❌ No YTS torrents found`);
        }
        
        // Test 4: Full Real-Debrid Search
        console.log(`\n🔍 Testing Full Real-Debrid Search...`);
        const torrents = await searchRealDebridTorrents(movieId, 'movie');
        if (torrents && torrents.length > 0) {
            console.log(`   ✅ Found ${torrents.length} total torrents from all sources`);
            torrents.slice(0, 3).forEach(t => {
                console.log(`      - ${t.title} (${t.source}, ${t.hash?.substring(0, 8)}...)`);
            });
        } else {
            console.log(`   ❌ No torrents found`);
        }
        
        // Test 5: Real-Debrid Instant Availability
        if (hasRealDebridKey && torrents.length > 0) {
            console.log(`\n⚡ Testing Real-Debrid Instant Availability...`);
            const hashes = torrents.map(t => t.hash).filter(Boolean).slice(0, 5);
            const availability = await checkRealDebridInstantAvailability(hashes);
            
            const availableCount = Object.keys(availability).length;
            console.log(`   📊 Checked ${hashes.length} hashes, ${availableCount} available in cache`);
            
            if (availableCount > 0) {
                console.log(`   ✅ Real-Debrid has cached versions available!`);
            } else {
                console.log(`   ⚠️  No cached versions available on Real-Debrid`);
            }
        } else if (!hasRealDebridKey) {
            console.log(`\n⚡ Skipping Real-Debrid Instant Availability (No API Key)`);
        }
        
        // Test 6: Stream Generation
        console.log(`\n🎥 Testing Stream Generation...`);
        const streams = await generateRealDebridStreams(movieId, 'movie');
        
        if (streams && streams.length > 0) {
            console.log(`   ✅ Generated ${streams.length} streams:`);
            
            const realStreams = streams.filter(s => s.behaviorHints?.realDebrid && s.behaviorHints?.cached);
            const sampleStreams = streams.filter(s => s.title.includes('Sample'));
            
            if (realStreams.length > 0) {
                console.log(`\n   🎯 REAL CACHED STREAMS (${realStreams.length}):`);
                realStreams.slice(0, 3).forEach(s => {
                    console.log(`      - ${s.title}`);
                    console.log(`        URL: ${s.url.substring(0, 50)}...`);
                    console.log(`        Quality: ${s.quality}, Size: ${s.size || 'Unknown'}`);
                });
            }
            
            if (sampleStreams.length > 0) {
                console.log(`\n   🎪 SAMPLE STREAMS (${sampleStreams.length}):`);
                sampleStreams.slice(0, 2).forEach(s => {
                    console.log(`      - ${s.title}`);
                    console.log(`        URL: ${s.url.substring(0, 50)}...`);
                });
            }
            
        } else {
            console.log(`   ❌ No streams generated`);
        }
        
        // Test 7: Summary
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📋 FUNCTIONALITY SUMMARY:`);
        console.log(`${'='.repeat(60)}`);
        
        if (hasRealDebridKey) {
            console.log(`✅ REAL FUNCTIONALITY ACTIVE:`);
            console.log(`   - Real torrent searching via YTS API`);
            console.log(`   - Real-Debrid instant availability checking`);
            console.log(`   - Actual cached stream URL generation`);
            console.log(`   - Live API integration`);
        } else {
            console.log(`⚠️  SAMPLE/DEMO MODE:`);
            console.log(`   - Using sample stream data`);
            console.log(`   - No real torrent cache checking`);
            console.log(`   - Demo URLs for testing`);
            console.log(`   - Add REAL_DEBRID_API_KEY for real functionality`);
        }
        
    } catch (error) {
        console.error('❌ Real-Debrid test error:', error);
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('🏁 Real-Debrid integration test completed!');
    console.log(`${'='.repeat(60)}`);
}

// Run the test
testRealDebridFunctionality();
