// test-subtitle-function.js
const { getSubtitleUrlsForStremio } = require('./lib/subtitleMatcher');

async function testSubtitleFunction() {
    console.log('Testing subtitle function...');
    
    try {
        const result = await getSubtitleUrlsForStremio('tt0111161', 'movie', null, null, 'tr');
        console.log('Result:', JSON.stringify(result, null, 2));
        
        if (result && result.subtitles) {
            console.log(`✅ Function works! Found ${result.subtitles.length} subtitles`);
        } else {
            console.log('❌ Function returned invalid format');
        }
    } catch (error) {
        console.error('❌ Function failed:', error);
    }
}

testSubtitleFunction();
