// config.js
// Holds all configuration for the addon.


const config = {
    // The port the addon server will run on.
    PORT: process.env.PORT || 7000,

    // The public URL of your addon.
    // Replace this with your actual VPS URL when you deploy.
    SERVER_URL: "http://your-vps-ip-or-domain:7000",

    // Your API key from OpenSubtitles.com (REQUIRED)
    // Register for a free account at https://www.opensubtitles.com
    // Set OPENSUBTITLES_API_KEY as an environment variable for production use.
    OPENSUBTITLES_API_KEY: process.env.OPENSUBTITLES_API_KEY,


    // TMDb API key (for TMDb-to-IMDb conversion)
    // Register at https://www.themoviedb.org/settings/api and set TMDB_API_KEY as an environment variable.
    TMDB_API_KEY: process.env.TMDB_API_KEY,

    // Podnapisi unofficial JSON API endpoint (no API key required)
    // See: https://www.podnapisi.net/subtitles/search/advanced?keywords=YourMovie&year=2025
    PODNAPISI_API_URL: process.env.PODNAPISI_API_URL || "https://www.podnapisi.net/subtitles/search/advanced",
    PODNAPISI_USER_AGENT: process.env.PODNAPISI_USER_AGENT || "Your-Application-Name/1.0",

    // Time in milliseconds for how long to cache subtitle match results.
    // 24 * 60 * 60 * 1000 = 24 hours.
    CACHE_DURATION_MS: 24 * 60 * 60 * 1000,


    // Subdl API key (for https://api.subdl.com/api/v1/subtitles)
    SUBDL_API_KEY: process.env.SUBDL_API_KEY || null, // If not set, fallback to HTML scrape

    // OpenSubtitles usage tracker
    opensubtitlesUsage: {
        count: 0,
        lastReset: Date.now()
    }
};

module.exports = config;
