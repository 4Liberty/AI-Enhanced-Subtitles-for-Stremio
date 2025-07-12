// lib/streamEnricher.js
// This module fetches streams and enriches them with subtitle match info.

const { getAvailableLanguagesForHash } = require('./subtitleMatcher');
const config = require('../config');
// In a real fork, you would import your actual Torrentio provider here.
// For this example, we'll simulate fetching streams.
const torrentioProvider = {
    getStreams: async (type, id) => {
        console.log(`Fetching streams from Torrentio provider for ${id}...`);
        // This is a mock response. In your fork, this would be a real API call
        // to the Torrentio addon or its internal logic.
        return [
            { name: '[RD+] Logan (2017) 2160p', infoHash: '08b34479599a224599904d9302cf38a5317eb8a1', title: '47.81 GB' },
            { name: '[RD+] Logan (2017) 2160p', infoHash: 'c266f578b7b7543883a45e9994c657577893a779', title: '16.08 GB' },
            { name: '[RD+] Logan (2017) 2160p', infoHash: 'A_DIFFERENT_HASH_WITH_NO_SUBS', title: '10.52 GB' },
        ];
    }
};

async function getEnrichedStreams(type, id, userConfig) {
    const originalStreams = await torrentioProvider.getStreams(type, id);
    const userPreferredLanguages = (userConfig && userConfig.languages) ? userConfig.languages : ['en'];
    console.log(`Enriching streams with preferred languages: ${userPreferredLanguages.join(', ')}`);

    const streamCheckPromises = originalStreams.map(async (stream) => {
        if (stream.infoHash) {
            const availableLangs = await getAvailableLanguagesForHash(stream.infoHash, userPreferredLanguages);

            if (availableLangs.length > 0) {
                const langTags = availableLangs.map(lang => lang.toUpperCase()).join(', ');
                stream.name = `[字幕 ✓ ${langTags}] ${stream.name}`;
                // Add AI-corrected subtitle links for each available language
                stream.subtitles = availableLangs.map(lang => ({
                    lang,
                    url: `${config.SERVER_URL}/ai-corrected-subtitle/${stream.infoHash}/${lang}`
                }));
            }
        }
        return stream;
    });

    return Promise.all(streamCheckPromises);
}

module.exports = { getEnrichedStreams };
