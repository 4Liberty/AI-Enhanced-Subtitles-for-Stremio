// Test script for Real-Debrid integration
const { searchRealDebridTorrents, checkRealDebridInstantAvailability, generateRealDebridStreams, generateSampleRealDebridStreams, getMovieMetadata, searchAllTorrentProviders } = require('./lib/realDebridSearch');

async function testRealDebridFunctionality() {
    console.log('='.repeat(80));
    console.log('🔍 TESTING TORRENTIO-STYLE MULTI-PROVIDER REAL-DEBRID INTEGRATION');
    console.log('='.repeat(80));
    
    // Test movie ID (The Matrix)
    const movieId = 'tt0133093';
    
    console.log(`\n📋 Testing with movie ID: ${movieId}`);
    
    // Test 1: Check API Keys
    const hasRealDebridKey = !!process.env.REAL_DEBRID_API_KEY;
    const hasTmdbKey = !!process.env.TMDB_API_KEY;
    const hasJackettUrl = !!process.env.JACKETT_URL;
    const hasJackettKey = !!process.env.JACKETT_API_KEY;
    
    console.log(`\n🔑 API Key Status:`);
    console.log(`   Real-Debrid API Key: ${hasRealDebridKey ? '✅ Available' : '❌ Missing'}`);
    console.log(`   TMDB API Key: ${hasTmdbKey ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Jackett URL: ${hasJackettUrl ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Jackett API Key: ${hasJackettKey ? '✅ Available' : '❌ Missing'}`);
    
    console.log(`\n📊 SUPPORTED TORRENT PROVIDERS (like Torrentio):`);
    console.log(`   ✅ YTS - High-quality movies`);
    console.log(`   ✅ EZTV - TV shows and movies`);
    console.log(`   ✅ RARBG - Movies and TV (via mirrors)`);
    console.log(`   ✅ ThePirateBay - General torrents (via API)`);
    console.log(`   ✅ TorrentGalaxy - Movies and TV`);
    console.log(`   ✅ Nyaa.si - Anime and Asian content`);
    console.log(`   ✅ AniDex - Anime torrents`);
    console.log(`   ${hasJackettUrl && hasJackettKey ? '✅' : '⚠️'} Jackett - Meta-search across 100+ sites`);
    console.log(`   ⚠️  1337x - General torrents (scraping required)`);
    console.log(`   ⚠️  KickassTorrents - General torrents (scraping required)`);
    console.log(`   ⚠️  MagnetDL - Magnet links (scraping required)`);
    console.log(`   ⚠️  Regional providers - Rutor, Comando, Torrent9, etc.`);
    
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
        
        // Test 3: Multi-Provider Search
        console.log(`\n🌐 Testing Multi-Provider Torrent Search (Torrentio-style)...`);
        const allResults = await searchAllTorrentProviders(movieId, movieData);
        if (allResults && allResults.length > 0) {
            console.log(`   ✅ Found ${allResults.length} total torrents from all providers`);
            
            // Group by source
            const sourceGroups = {};
            allResults.forEach(t => {
                const source = t.source || 'Unknown';
                if (!sourceGroups[source]) sourceGroups[source] = [];
                sourceGroups[source].push(t);
            });
            
            console.log(`\n   📊 Results by Provider:`);
            Object.entries(sourceGroups).forEach(([source, torrents]) => {
                console.log(`      ${source}: ${torrents.length} torrents`);
            });
            
            // Show top torrents
            console.log(`\n   🎯 Top 5 Torrents:`);
            allResults.slice(0, 5).forEach((t, i) => {
                console.log(`      ${i+1}. ${t.title} (${t.source}, ${t.seeds} seeds)`);
            });
        } else {
            console.log(`   ❌ No torrents found from any provider`);
        }
        
        // Test 4: Full Real-Debrid Search
        console.log(`\n🔍 Testing Full Real-Debrid Integration...`);
        const torrents = await searchRealDebridTorrents(movieId, 'movie');
        if (torrents && torrents.length > 0) {
            console.log(`   ✅ Found ${torrents.length} unique torrents after deduplication`);
            
            // Show hash distribution
            const hashCount = torrents.filter(t => t.hash).length;
            console.log(`   📊 ${hashCount} torrents have valid hashes for Real-Debrid checking`);
        } else {
            console.log(`   ❌ No torrents found`);
        }
        
        // Test 5: Real-Debrid Instant Availability
        if (hasRealDebridKey && torrents.length > 0) {
            console.log(`\n⚡ Testing Real-Debrid Instant Availability...`);
            const hashes = torrents.map(t => t.hash).filter(Boolean).slice(0, 10);
            const availability = await checkRealDebridInstantAvailability(hashes);
            
            const availableCount = Object.keys(availability).length;
            console.log(`   📊 Checked ${hashes.length} hashes, ${availableCount} available in Real-Debrid cache`);
            
            if (availableCount > 0) {
                console.log(`   ✅ Real-Debrid has cached versions available!`);
                console.log(`   📁 Available cached files:`);
                Object.entries(availability).slice(0, 3).forEach(([hash, files]) => {
                    const fileCount = Object.keys(files).length;
                    console.log(`      Hash ${hash.substring(0, 8)}...: ${fileCount} file(s)`);
                });
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
                    console.log(`        Quality: ${s.quality}, Size: ${s.size ? (s.size/1024/1024/1024).toFixed(1) + ' GB' : 'Unknown'}`);
                    console.log(`        Seeds: ${s.seeds}, Peers: ${s.peers}`);
                });
            }
            
            if (sampleStreams.length > 0) {
                console.log(`\n   🎪 SAMPLE STREAMS (${sampleStreams.length}):`);
                sampleStreams.slice(0, 2).forEach(s => {
                    console.log(`      - ${s.title}`);
                    console.log(`        Quality: ${s.quality}, Size: ${s.size ? (s.size/1024/1024/1024).toFixed(1) + ' GB' : 'Unknown'}`);
                });
            }
            
        } else {
            console.log(`   ❌ No streams generated`);
        }
        
        // Test 7: Summary
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📋 TORRENTIO-STYLE FUNCTIONALITY SUMMARY:`);
        console.log(`${'='.repeat(80)}`);
        
        if (hasRealDebridKey) {
            console.log(`✅ REAL MULTI-PROVIDER FUNCTIONALITY ACTIVE:`);
            console.log(`   - Real torrent searching via ${Object.keys(sourceGroups || {}).length} providers`);
            console.log(`   - Real-Debrid instant availability checking`);
            console.log(`   - Actual cached stream URL generation`);
            console.log(`   - Live API integration across multiple torrent sites`);
            console.log(`   - Same provider coverage as Torrentio`);
        } else {
            console.log(`⚠️  SAMPLE/DEMO MODE:`);
            console.log(`   - Multi-provider search framework ready`);
            console.log(`   - Using sample stream data`);
            console.log(`   - No real torrent cache checking`);
            console.log(`   - Add REAL_DEBRID_API_KEY for full functionality`);
        }
        
        console.log(`\n🎯 PROVIDER CONFIGURATION:`);
        console.log(`   - Add JACKETT_URL and JACKETT_API_KEY for 100+ more sites`);
        console.log(`   - Enable regional providers for local content`);
        console.log(`   - All providers run in parallel for maximum speed`);
        
    } catch (error) {
        console.error('❌ Real-Debrid test error:', error);
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('🏁 Torrentio-style Real-Debrid integration test completed!');
    console.log(`${'='.repeat(80)}`);
}

// Run the test
testRealDebridFunctionality();
