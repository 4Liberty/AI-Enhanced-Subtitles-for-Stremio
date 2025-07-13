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
        try {
            // Only enrich if infoHash or url is present
            if (stream.infoHash || stream.url) {
                const subResult = await getSubtitleUrlsForStremio(id);
                stream.subtitles = subResult.subtitles || [];
            } else {
                stream.subtitles = [];
            }
        } catch (err) {
            stream.subtitles = [];
            stream.error = `Subtitle enrichment failed: ${err && err.message ? err.message : err}`;
            console.error(`[StreamEnricher] Subtitle enrichment failed for stream:`, err);
        }
        return stream;
    }));
    return enriched;
}

module.exports = { getEnrichedStreams };
D