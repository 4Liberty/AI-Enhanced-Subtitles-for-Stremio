// lib/streamEnricher.js
// This module fetches streams and enriches them with subtitle match info.

const { getSubtitleUrlsForStremio } = require('./subtitleMatcher');
// No need to import config here
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
    console.log(`[Stremio Addon] Enriching streams for type=${type}, id=${id}, preferred languages: ${userPreferredLanguages.join(', ')}`);

    const streamCheckPromises = originalStreams.map(async (stream) => {
        let subtitleObjs = [];
        if (stream.infoHash) {
            try {
                // Timeout logic: if subtitle API takes too long, skip enrichment
                subtitleObjs = await Promise.race([
                    getSubtitleUrlsForStremio(stream.infoHash, userPreferredLanguages),
                    new Promise(resolve => setTimeout(() => resolve([]), 30000)) // 30s timeout
                ]);
                if (Array.isArray(subtitleObjs) && subtitleObjs.length > 0) {
                    const langTags = subtitleObjs.map(sub => sub.lang.toUpperCase()).join(', ');
                    stream.name = `[Sub ✓ ${langTags}] ${stream.name}`;
                }
            } catch (err) {
                stream.error = `Subtitle enrichment failed: ${err && err.message ? err.message : err}`;
                console.error(`[Stremio Addon] Subtitle enrichment failed for stream ${stream.infoHash}:`, err);
            }
        }
        // Always include subtitles property, even if empty
        stream.subtitles = Array.isArray(subtitleObjs) ? subtitleObjs : [];
        return stream;
    });

    return Promise.all(streamCheckPromises);
}

module.exports = { getEnrichedStreams };
