// Simple test to check if server can start
console.log("Testing server startup...");

try {
    // Set minimum required environment variables for testing
    process.env.SUBDL_API_KEY = "test-key";
    process.env.OPENSUBTITLES_API_KEY = "test-key";  
    process.env.GEMINI_API_KEY = "test-key";
    
    console.log("Environment variables set for testing");
    
    // Test require statements
    const express = require('express');
    console.log("✅ Express loaded");
    
    const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
    console.log("✅ Stremio SDK loaded");
    
    const { getAICorrectedSubtitle, getSubtitleUrlsForStremio, getCachedSubtitleContent, getProgressiveSubtitleContent, aiEnhancementStatus } = require('./lib/subtitleMatcher');
    console.log("✅ Subtitle matcher loaded");
    
    const { streamEnricher } = require('./lib/streamEnricher');
    console.log("✅ Stream enricher loaded");
    
    const { generateRealDebridStreams, generateSampleRealDebridStreams } = require('./lib/realDebridSearch');
    console.log("✅ Real-Debrid search loaded");
    
    const { initializeStreamingProviders } = require('./lib/streamingProviderManager');
    console.log("✅ Streaming provider manager loaded");
    
    const { setupUIRoutes } = require('./ui-api');
    console.log("✅ UI API loaded");
    
    console.log("🎉 All modules loaded successfully!");
    
} catch (error) {
    console.error("❌ Error during startup test:", error.message);
    console.error("Stack:", error.stack);
}
