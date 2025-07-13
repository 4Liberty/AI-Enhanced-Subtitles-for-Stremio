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
    try {
        if (!Array.isArray(streams)) return [];
        // Deep clone input to avoid mutation
        const safeStreams = streams.map(s => (typeof s === 'object' && s !== null) ? JSON.parse(JSON.stringify(s)) : {});
        const enriched = await Promise.all(safeStreams.map(async (stream, idx) => {
            try {
                // Validate stream structure
                if (typeof stream !== 'object' || stream === null) {
                    console.error(`[StreamEnricher] Malformed stream at index ${idx}:`, stream);
                    return {
                        subtitles: [{ id: 'fallback-tr', lang: 'tr', url: '', behaviorHints: { notWebReady: true, fallback: true }, name: '[Subtitle unavailable]' }],
                        error: 'Malformed stream object.'
                    };
                }
                // Always ensure subtitles property exists and is an array
                stream.subtitles = [];
                let lastError = null;
                if (stream.infoHash || stream.url) {
                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            const subResult = await getSubtitleUrlsForStremio(id);
                            if (subResult && Array.isArray(subResult.subtitles) && subResult.subtitles.length > 0) {
                                // Sanitize subtitle objects
                                stream.subtitles = subResult.subtitles.map(sub => ({
                                    id: typeof sub.id === 'string' ? sub.id : 'unknown',
                                    lang: sub.lang === 'tr' ? 'tr' : 'tr',
                                    url: typeof sub.url === 'string' ? sub.url : '',
                                    behaviorHints: typeof sub.behaviorHints === 'object' && sub.behaviorHints !== null ? sub.behaviorHints : {},
                                    name: typeof sub.name === 'string' ? sub.name : undefined
                                }));
                                break;
                            }
                        } catch (err) {
                            lastError = err;
                        }
                    }
                    if (!Array.isArray(stream.subtitles) || stream.subtitles.length === 0) {
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
                // Final output sanitization
                if (!Array.isArray(stream.subtitles)) stream.subtitles = [];
                return stream;
            } catch (err) {
                console.error(`[StreamEnricher] Unexpected error in stream enrichment at index ${idx}:`, err);
                return {
                    subtitles: [{ id: 'fallback-tr', lang: 'tr', url: '', behaviorHints: { notWebReady: true, fallback: true }, name: '[Subtitle unavailable]' }],
                    error: 'Unexpected error in stream enrichment.'
                };
            }
        }));
        // Always return a valid array
        if (!Array.isArray(enriched)) return [];
        return enriched;
    } catch (err) {
        console.error('[StreamEnricher] CRITICAL: getEnrichedStreams failed:', err);
        return [];
    }
}

module.exports = { getEnrichedStreams };
D