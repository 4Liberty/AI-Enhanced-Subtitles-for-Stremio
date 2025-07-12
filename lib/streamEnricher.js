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
                // Pass the infoHash to getSubtitleUrlsForStremio
                const subtitleResult = await getSubtitleUrlsForStremio(id, stream.infoHash);
                subtitleObjs = subtitleResult.subtitles || [];

                if (Array.isArray(subtitleObjs) && subtitleObjs.length > 0) {
                    const langTags = subtitleObjs.map(sub => sub.lang.toUpperCase()).join(', ');
                    if (subtitleObjs[0].name && subtitleObjs[0].name.includes('Perfect Match')) {
                        stream.name = `[🎯 Perfect Match] ${stream.name}`;
                    } else {
                        stream.name = `[Sub ✓ ${langTags}] ${stream.name}`;
                    }
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
