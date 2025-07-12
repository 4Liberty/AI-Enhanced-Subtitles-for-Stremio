// config.js
// Holds all configuration for the addon.

const config = {
    // The port the addon server will run on.
    PORT: process.env.PORT || 7000,

    // The public URL of your addon.
    // Replace this with your actual VPS URL when you deploy.
    SERVER_URL: "http://your-vps-ip-or-domain:7000",

    // Your API key from OpenSubtitles.com
    // Register for a free account at https://www.opensubtitles.com
    OPENSUBTITLES_API_KEY: "YOUR_OPENSUBTITLES_API_KEY",

    // Time in milliseconds for how long to cache subtitle match results.
    // 24 * 60 * 60 * 1000 = 24 hours.
    CACHE_DURATION_MS: 24 * 60 * 60 * 1000,
};

module.exports = config;
