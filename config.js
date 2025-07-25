// config.js
// Holds all configuration for the addon.

const config = {
    // The port the addon server will run on.
    PORT: process.env.PORT || 7000,

    // The public URL of your addon.
    SERVER_URL: process.env.SERVER_URL || "http://127.0.0.1:7000",

    // Time in milliseconds for how long to cache subtitle match results.
    CACHE_DURATION_MS: 2 * 60 * 60 * 1000, // 2 hours

    // Redis configuration
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || null,
    },

    // SQLite database configuration
    database: {
        path: process.env.DB_PATH || './data/database.sqlite',
    },

    // Provider configurations
    providers: {
        opensubtitles: {
            enabled: !!process.env.OPENSUBTITLES_API_KEY,
            name: "OpenSubtitles",
            apiKey: process.env.OPENSUBTITLES_API_KEY
        },
        subdl: {
            enabled: !!process.env.SUBDL_API_KEY,
            name: "SubDL",
            apiKey: process.env.SUBDL_API_KEY
        },
        podnapisi: {
            enabled: process.env.PODNAPISI_ENABLED === 'true',
            name: "Podnapisi",
            apiUrl: process.env.PODNAPISI_API_URL || "https://www.podnapisi.net/subtitles/search/advanced",
            userAgent: process.env.PODNAPISI_USER_AGENT || "Stremio-AI-Addon/2.0"
        },
        realdebrid: {
            enabled: !!process.env.REAL_DEBRID_API_KEY,
            name: "Real-Debrid",
            apiKey: process.env.REAL_DEBRID_API_KEY
        },
        gemini: {
            enabled: !!process.env.GEMINI_API_KEY,
            name: "Gemini AI",
            apiKey: process.env.GEMINI_API_KEY
        },
        tmdb: {
            enabled: !!process.env.TMDB_API_KEY,
            name: "TMDb",
            apiKey: process.env.TMDB_API_KEY
        }
    }
};

module.exports = config;
