// lib/subtitleMatcher.js
// --- OVERHAULED & ROBUST VERSION v2.0.0 ---

const fetch = require('node-fetch');
const zlib = require('zlib');
const AdmZip = require('adm-zip');
const { RarRapper } = require('rar-rapper');
const { srtValidator } = require('srt-validator');
const { getConfig } = require('./config');
const { cache, getCache, setCache } = require('./cache');
const LANGUAGES = require('../docs/languages.json');
const { cleanText, parseSrt, stringifySrt, toSrt, toVtt } = require('./utils/subtitleUtils');
const { getMovieDetails, getSeriesDetails } = require('./utils/tmdb');
const { robustFetch, sequentialPromise, parallelPromise } = require('./utils/fetch');
const { logger, logError, logSubtitle } = require('./utils/logger');
const {
    enhanceSubtitleWithAI,
    getAIProvider,
    getAvailableModels,
    testAIKey,
    isAIEnabled
} = require('./ai');

const SUBTITLE_CACHE_TTL = 24 * 60 * 60; // 24 hours
const AI_SUBTITLE_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days
const FAILED_AI_CACHE_TTL = 60 * 60; // 1 hour

// --- Subtitle Provider Implementations ---
/**
 * Fetches subtitles from SubDL.
 * @param {string} videoId - IMDb ID of the movie/series.
 * @param {string} infoHash - Torrent info hash (optional).
 * @returns {Promise<Array>} A promise that resolves to an array of subtitle objects.
 */
async function fetchSubdlSubtitle(videoId, infoHash) {
    const { SUBDL_API_KEY } = await getConfig();
    if (!SUBDL_API_KEY) {
        logger.warn('SubDL API key not configured, skipping');
        return [];
    }

    const imdbId = videoId.replace('tt', '');
    const searchParams = new URLSearchParams({
        api_key: SUBDL_API_KEY,
        languages: 'tr',
        subs_per_page: 10,
        imdb_id: `tt${imdbId}`,
        type: 'movie', // Adjust if series support is needed
    });

    const url = `https://api.subdl.com/api/v1/subtitles?${searchParams.toString()}`;
    logger.info(`SubDL API URL: ${url}`);

    try {
        const response = await robustFetch(url, { timeout: 5000 });
        const data = await response.json();

        if (data && data.subtitles && data.subtitles.length > 0) {
            logger.info(`SubDL found ${data.subtitles.length} subtitles`);
            return data.subtitles
                .filter(sub => sub.language.toLowerCase() === 'tr' || sub.lang.toLowerCase() === 'turkish')
                .map(sub => ({
                    id: `subdl-${sub.url.split('/')[2].split('-')[0]}`,
                    lang: 'tr',
                    provider: 'subdl',
                    url: `https://dl.subdl.com${sub.url}`,
                    releaseName: sub.release_name,
                    score: 0, // Score will be calculated later
                }));
        } else {
            logger.info('SubDL returned no Turkish subtitles');
            return [];
        }
    } catch (error) {
        logError(error, 'Error fetching subtitles from SubDL');
        return [];
    }
}

/**
 * Fetches subtitles from OpenSubtitles.
 * @param {string} videoId - IMDb ID of the movie/series.
 * @returns {Promise<Array>} A promise that resolves to an array of subtitle objects.
 */
async function fetchOpenSubtitlesSubtitle(videoId) {
    const { OPENSUBTITLES_API_KEY } = await getConfig();
    if (!OPENSUBTITLES_API_KEY) {
        logger.warn('OpenSubtitles API key not configured, skipping');
        return [];
    }

    const imdbId = videoId.replace('tt', '');
    const searchParams = new URLSearchParams({
        languages: 'tr,tur,turkish',
        order_by: 'download_count',
        order_direction: 'desc',
        per_page: 50,
        imdb_id: imdbId,
    });

    const url = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams.toString()}`;
    logger.info(`OpenSubtitles API URL: ${url}`);

    try {
        const response = await robustFetch(url, {
            headers: { 'Api-Key': OPENSUBTITLES_API_KEY, 'Accept': 'application/json' },
            timeout: 5000,
        });
        const data = await response.json();

        if (data && data.data && data.data.length > 0) {
            logger.info(`OpenSubtitles found ${data.data.length} subtitles`);
            const downloadUrls = await Promise.all(
                data.data.map(sub => getOpenSubtitlesDownloadUrl(sub.attributes.files[0].file_id))
            );

            return data.data
                .map((sub, index) => ({
                    id: `opensubtitles-${sub.id}`,
                    lang: 'tr',
                    provider: 'opensubtitles',
                    url: downloadUrls[index],
                    releaseName: sub.attributes.release,
                    score: sub.attributes.download_count,
                }))
                .filter(sub => sub.url);
        } else {
            logger.info('OpenSubtitles returned no Turkish subtitles');
            return [];
        }
    } catch (error) {
        logError(error, 'Error fetching subtitles from OpenSubtitles');
        return [];
    }
}

/**
 * Gets the download URL for an OpenSubtitles file.
 * @param {string} fileId - The file ID from OpenSubtitles.
 * @returns {Promise<string|null>} A promise that resolves to the download URL or null.
 */
async function getOpenSubtitlesDownloadUrl(fileId) {
    const { OPENSUBTITLES_API_KEY } = await getConfig();
    const url = 'https://api.opensubtitles.com/api/v1/download';

    try {
        const response = await robustFetch(url, {
            method: 'POST',
            headers: {
                'Api-Key': OPENSUBTITLES_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ file_id: fileId }),
            timeout: 5000,
        });
        const data = await response.json();
        return data.link || null;
    } catch (error) {
        logError(error, `Failed to get OpenSubtitles download link for file_id: ${fileId}`);
        return null;
    }
}

// --- Decompression and Processing ---
/**
 * Decompresses a ZIP subtitle archive.
 * @param {Buffer} buffer - The buffer containing the ZIP file.
 * @returns {Promise<string|null>} A promise that resolves to the subtitle content or null.
 */
async function decompressZipSubtitle(buffer) {
    try {
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();
        const srtEntry = zipEntries.find(entry => entry.entryName.toLowerCase().endsWith('.srt'));

        if (srtEntry) {
            logger.info(`Found SRT file in ZIP: ${srtEntry.entryName}`);
            return srtEntry.getData().toString('utf8');
        }
        logger.warn('No .srt file found in ZIP archive');
        return null;
    } catch (error) {
        logError(error, 'Error decompressing ZIP subtitle');
        return null;
    }
}

/**
 * Decompresses a RAR subtitle archive.
 * @param {Buffer} buffer - The buffer containing the RAR file.
 * @returns {Promise<string|null>} A promise that resolves to the subtitle content or null.
 */
async function decompressRarSubtitle(buffer) {
    try {
        const files = await RarRapper.unrar(buffer, { type: 'buffer' });
        const srtFile = files.find(file => file.name.toLowerCase().endsWith('.srt'));

        if (srtFile) {
            logger.info(`Found SRT file in RAR: ${srtFile.name}`);
            return srtFile.extract().toString('utf8');
        }
        logger.warn('No .srt file found in RAR archive');
        return null;
    } catch (error) {
        logError(error, 'Error decompressing RAR subtitle');
        return [];
    }
}

/**
 * Decompresses a subtitle from an unknown archive format.
 * @param {Buffer} buffer - The buffer containing the file.
 * @param {string} contentType - The content type of the response.
 * @returns {Promise<string|null>} A promise that resolves to the subtitle content or null.
 */
async function decompressUnknownFormat(buffer, contentType) {
    logger.info(`Attempting to decompress based on content type: ${contentType}`);
    if (contentType.includes('zip') || contentType.includes('octet-stream')) {
        return await decompressZipSubtitle(buffer);
    } else if (contentType.includes('rar')) {
        return await decompressRarSubtitle(buffer);
    } else {
        logger.warn(`Unsupported content type for decompression: ${contentType}`);
        return null;
    }
}

/**
 * Downloads and processes a subtitle file.
 * @param {object} subtitle - The subtitle object with URL and provider info.
 * @returns {Promise<string|null>} A promise that resolves to the subtitle content or null.
 */
async function downloadAndProcessSubtitle(subtitle) {
    try {
        logger.info(`Downloading subtitle from ${subtitle.provider}: ${subtitle.url}`);
        const response = await robustFetch(subtitle.url, { timeout: 10000 });
        const contentType = response.headers.get('content-type') || '';
        const contentDisposition = response.headers.get('content-disposition') || '';

        const buffer = await response.buffer();

        if (buffer.length === 0) {
            logger.warn(`Downloaded empty file from ${subtitle.url}`);
            return null;
        }

        // Check if it's already a plain text subtitle
        if (contentType.includes('text') || contentType.includes('srt')) {
            logger.info('Downloaded plain text subtitle');
            return buffer.toString('utf8');
        }

        // Otherwise, attempt decompression
        logger.info('Downloaded binary file, attempting decompression');
        let decodedFilename = 'subtitle';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^'";\n]*)/i);
            if (filenameMatch && filenameMatch[1]) {
                decodedFilename = decodeURIComponent(filenameMatch[1]);
            }
        }

        if (decodedFilename.toLowerCase().endsWith('.zip')) {
            return await decompressZipSubtitle(buffer);
        } else if (decodedFilename.toLowerCase().endsWith('.rar')) {
            return await decompressRarSubtitle(buffer);
        } else {
            return await decompressUnknownFormat(buffer, contentType);
        }

    } catch (error) {
        logError(error, `Failed to download or process subtitle from ${subtitle.url}`);
        return null;
    }
}

// --- Main Logic ---
/**
 * Gets subtitle URLs for a Stremio request.
 * @param {object} args - The Stremio request arguments.
 * @returns {Promise<Array>} A promise that resolves to an array of Stremio subtitle objects.
 */
async function getSubtitleUrlsForStremio(args) {
    const videoId = args.id.split(':')[0];
    const infoHash = args.extra.videoHash || null;
    const cacheKey = `subtitles-${videoId}-${infoHash || 'nohash'}`;
    const cached = await getCache(cacheKey);

    if (cached) {
        logger.info(`Serving subtitles from cache for: ${videoId}`);
        return cached;
    }

    logger.info(`SEAMLESS MODE: Fast subtitle discovery for: ${videoId} (hash: ${infoHash || 'none'})`);

    const providers = [
        () => fetchSubdlSubtitle(videoId, infoHash),
        () => fetchOpenSubtitlesSubtitle(videoId),
    ];

    const allSubtitles = (await parallelPromise(providers)).flat();

    if (allSubtitles.length === 0) {
        logger.warn(`No subtitles found from any provider for ${videoId}`);
        return [];
    }

    // For now, we'll just take the best from each provider without complex scoring
    const bestSubdl = allSubtitles.find(s => s.provider === 'subdl');
    const bestOpenSubtitles = allSubtitles.find(s => s.provider === 'opensubtitles');

    const candidates = [bestSubdl, bestOpenSubtitles].filter(Boolean);

    if (candidates.length === 0) {
        logger.warn(`No viable subtitle candidates found for ${videoId}`);
        return [];
    }

    const subtitleContent = await downloadAndProcessSubtitle(candidates[0]);

    if (!subtitleContent) {
        logger.warn('Failed to get content for the best subtitle, trying fallback');
        // Simple fallback for now
        const fallbackContent = candidates[1] ? await downloadAndProcessSubtitle(candidates[1]) : null;
        if (!fallbackContent) {
            logger.error('All subtitle candidates failed to download/process.');
            return [];
        }
        await setCache(`${videoId}-${candidates[1].provider}`, fallbackContent, SUBTITLE_CACHE_TTL);
        return createStremioResponse(videoId, candidates[1].provider, false);
    }

    const primaryProvider = candidates[0].provider;
    await setCache(`${videoId}-${primaryProvider}`, subtitleContent, SUBTITLE_CACHE_TTL);

    // Start AI enhancement in the background
    if (isAIEnabled()) {
        logger.info(`Starting background AI enhancement for ${primaryProvider}`);
        enhanceSubtitleWithAI(subtitleContent, videoId, primaryProvider)
            .then(aiContent => {
                if (aiContent) {
                    setCache(`${videoId}-${primaryProvider}-ai`, aiContent, AI_SUBTITLE_CACHE_TTL);
                    logger.info(`Background AI enhancement successful for ${videoId}`);
                }
            })
            .catch(err => {
                logError(err, `Background AI enhancement failed for ${videoId}`);
                setCache(`${videoId}-${primaryProvider}-ai-failed`, true, FAILED_AI_CACHE_TTL);
            });
    }

    const stremioSubs = createStremioResponse(videoId, primaryProvider, isAIEnabled());
    await setCache(cacheKey, stremioSubs, 60 * 60); // Cache Stremio response for 1 hour
    return stremioSubs;
}

/**
 * Creates the Stremio subtitle response array.
 * @param {string} videoId - The IMDb ID.
 * @param {string} provider - The subtitle provider used.
 * @param {boolean} withAI - Whether to include an AI-enhanced option.
 * @returns {Array} An array of Stremio subtitle objects.
 */
function createStremioResponse(videoId, provider, withAI) {
    const { host } = getConfig();
    const subtitles = [];

    // Original subtitle
    subtitles.push({
        id: `${provider}-original-tr`,
        lang: 'tr',
        url: `${host}/subtitles/${videoId}/tr.srt?source=${provider}`,
        name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Turkish (Ready)`,
    });

    // AI-enhanced subtitle
    if (withAI) {
        subtitles.push({
            id: `${provider}-ai-tr`,
            lang: 'tr',
            url: `${host}/subtitles/${videoId}/tr.srt?source=${provider}-ai`,
            name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} AI-Enhanced Turkish`,
        });
    }

    return subtitles;
}

/**
 * Gets cached or AI-corrected subtitle content.
 * @param {string} videoId - The IMDb ID.
 * @param {string} source - The source of the subtitle (e.g., 'subdl', 'opensubtitles-ai').
 * @returns {Promise<string|null>} A promise that resolves to the subtitle content or null.
 */
async function getCachedSubtitleContent(videoId, source) {
    const cacheKey = `${videoId}-${source}`;
    const content = await getCache(cacheKey);
    if (content) {
        logger.info(`Serving subtitle content from cache: ${cacheKey}`);
        return content;
    }
    logger.warn(`No cached content found for: ${cacheKey}`);
    return null;
}

module.exports = {
    getSubtitleUrlsForStremio,
    getCachedSubtitleContent,
    fetchSubdlSubtitle,
    fetchOpenSubtitlesSubtitle,
    downloadAndProcessSubtitle,
    decompressZipSubtitle,
    decompressRarSubtitle,
    enhanceSubtitleWithAI,
    getAIProvider,
    getAvailableModels,
    testAIKey,
    isAIEnabled,
};