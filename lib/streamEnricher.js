// lib/streamEnricher.js
// This module fetches streams and enriches them with subtitle match info.


const { getSubtitleUrlsForStremio } = require('./subtitleMatcher');

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
