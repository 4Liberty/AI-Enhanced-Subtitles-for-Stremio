D// lib/streamEnricher.js
// Actively enriches streams with Turkish subtitle match info for Stremio.

const { getSubtitleUrlsForStremio } = require('./subtitleMatcher');

/**
 * Enriches a list of streams with Turkish subtitle info.
 * @param {string} type - The type of content (movie, series, etc.)
 * @param {string} id - The Stremio ID (tt... or tmdb:...)
 * @param {Array} streams - Array of stream objects to enrich
 * @returns {Promise<Array>} - Streams with .subtitles property (if found)
 */
async function getEnrichedStreams(type, id, streams) {
    if (!Array.isArray(streams)) return [];
    const enriched = await Promise.all(streams.map(async (stream) => {
        // Always ensure subtitles property exists
        stream.subtitles = [];
        let lastError = null;
        if (stream.infoHash || stream.url) {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const subResult = await getSubtitleUrlsForStremio(id);
                    if (subResult && Array.isArray(subResult.subtitles) && subResult.subtitles.length > 0) {
                        stream.subtitles = subResult.subtitles;
                        break;
                    }
                } catch (err) {
                    lastError = err;
                }
            }
            // If still no subtitles, add fallback
            if (!stream.subtitles || stream.subtitles.length === 0) {
                stream.subtitles = [{
                    id: 'fallback-tr',
                    lang: 'tr',
                    url: '',
                    behaviorHints: { notWebReady: true, fallback: true },
                    name: '[Subtitle unavailable]'
                }];
                if (lastError) {
                    stream.error = `Subtitle enrichment failed: ${lastError && lastError.message ? lastError.message : lastError}`;
                    console.error(`[StreamEnricher] Subtitle enrichment failed for stream:`, lastError);
                }
            }
        } else {
            stream.subtitles = [];
        }
        return stream;
    }));
    return enriched;
}

module.exports = { getEnrichedStreams };
D