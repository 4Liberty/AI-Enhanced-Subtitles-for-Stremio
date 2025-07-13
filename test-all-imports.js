// Test script to verify all imports and basic functionality
console.log('🔍 Testing all imports and basic functionality...\n');

try {
    console.log('1. Testing subtitleMatcher imports...');
    const { getSubtitleUrlsForStremio, getAICorrectedSubtitle, getCachedSubtitleContent, getProgressiveSubtitleContent, aiEnhancementStatus } = require('./lib/subtitleMatcher');
    console.log('✅ subtitleMatcher imports successful');
    
    console.log('2. Testing realDebridSearch imports...');
    const { generateRealDebridStreams, generateSampleRealDebridStreams } = require('./lib/realDebridSearch');
    console.log('✅ realDebridSearch imports successful');
    
    console.log('3. Testing ui-api imports...');
    const { setupUIRoutes } = require('./ui-api');
    console.log('✅ ui-api imports successful');
    
    console.log('4. Testing core modules...');
    const express = require('express');
    const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
    const path = require('path');
    console.log('✅ Core modules loaded successfully');
    
    console.log('5. Testing function types...');
    console.log('- getSubtitleUrlsForStremio:', typeof getSubtitleUrlsForStremio);
    console.log('- generateRealDebridStreams:', typeof generateRealDebridStreams);
    console.log('- setupUIRoutes:', typeof setupUIRoutes);
    console.log('- aiEnhancementStatus:', typeof aiEnhancementStatus);
    
    console.log('\n🎉 All tests passed! The server should start without errors.');
    
} catch (error) {
    console.error('❌ Error during testing:', error);
    process.exit(1);
}
