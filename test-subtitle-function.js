// test-subtitle-function.js
const { getSubtitleUrlsForStremio, tmdbToImdb } = require('./lib/subtitleMatcher');

async function testSubtitleFunction() {
    console.log('--- Starting Comprehensive Subtitle Function Test ---');

    const testCases = [
        {
            description: "Movie with IMDb ID (The Shawshank Redemption)",
            imdbId: 'tt0111161',
            type: 'movie',
            season: null,
            episode: null,
            language: 'tr'
        },
        {
            description: "TV Series with IMDb ID (Breaking Bad S01E01)",
            imdbId: 'tt0903747',
            type: 'series',
            season: 1,
            episode: 1,
            language: 'tr'
        },
        {
            description: "Movie with English Subtitles (Inception)",
            imdbId: 'tt1375666',
            type: 'movie',
            season: null,
            episode: null,
            language: 'en'
        },
        {
            description: "Movie with TMDb ID (The Dark Knight)",
            tmdbId: '155',
            type: 'movie',
            season: null,
            episode: null,
            language: 'tr'
        },
        {
            description: "Invalid IMDb ID",
            imdbId: 'ttinvalid',
            type: 'movie',
            season: null,
            episode: null,
            language: 'tr'
        }
    ];

    for (const test of testCases) {
        console.log(`\n--- Testing: ${test.description} ---`);
        try {
            let imdbId = test.imdbId;
            if (test.tmdbId) {
                console.log(`Converting TMDb ID ${test.tmdbId} to IMDb ID...`);
                imdbId = await tmdbToImdb(test.tmdbId);
                if (!imdbId) {
                    console.log('❌ TMDb to IMDb conversion failed.');
                    continue;
                }
                console.log(`Converted to IMDb ID: ${imdbId}`);
            }

            const result = await getSubtitleUrlsForStremio(imdbId, test.type, test.season, test.episode, test.language);
            
            console.log('Result:', JSON.stringify(result, null, 2));
            
            if (Array.isArray(result)) {
                console.log(`✅ Test Passed! Found ${result.length} subtitles.`);
                if (result.length > 0) {
                    console.log('First result URL:', result[0].url);
                }
            } else {
                console.log('❌ Test Failed: Function returned invalid format:', typeof result);
            }
        } catch (error) {
            console.error('❌ Test Failed with error:', error);
        }
    }

    console.log('\n--- Comprehensive Subtitle Function Test Finished ---');
}

testSubtitleFunction();
