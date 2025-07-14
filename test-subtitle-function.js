// test-subtitle-function.js
const { getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

async function testSubtitleFunction() {
    console.log('Testing updated subtitle function...');
    
    try {
        const result = await getSubtitleUrlsForStremio('tt0111161', 'movie', null, null, 'tr');
        console.log('Result:', JSON.stringify(result, null, 2));
        
        if (Array.isArray(result)) {
            console.log(`✅ Function works! Found ${result.length} subtitles`);
            console.log('Return format is correct (array)');
        } else {
            console.log('❌ Function returned invalid format:', typeof result);
        }
    } catch (error) {
        console.error('❌ Function failed:', error);
    }
}

testSubtitleFunction();
