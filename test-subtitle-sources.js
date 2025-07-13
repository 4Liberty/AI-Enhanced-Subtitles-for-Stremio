// Test script to check subtitle sources
const { getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

async function testSubtitleSources() {
    console.log('Testing subtitle sources...');
    console.log('SUBDL_API_KEY present:', !!process.env.SUBDL_API_KEY);
    console.log('OPENSUBTITLES_API_KEY present:', !!process.env.OPENSUBTITLES_API_KEY);
    
    // Test with a known movie
    const testVideoId = 'tt0111161'; // The Shawshank Redemption
    const testHash = null;
    
    console.log('\nTesting with videoId:', testVideoId);
    
    try {
        const result = await getSubtitleUrlsForStremio(testVideoId, testHash);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testSubtitleSources();
