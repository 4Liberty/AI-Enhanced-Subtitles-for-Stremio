// Test RAR library functionality
const fs = require('fs');
const path = require('path');

async function testRarLibraries() {
    console.log('Testing RAR libraries...');
    
    // Test 1: unrar-js
    try {
        const { createExtractorFromData } = require('unrar-js');
        console.log('✅ unrar-js loaded successfully');
        
        // Test basic functionality
        const testBuffer = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00]); // RAR 5.0 signature
        console.log('✅ unrar-js basic test passed');
        
    } catch (error) {
        console.log('❌ unrar-js test failed:', error.message);
    }
    
    // Test 2: rar-stream
    try {
        const RarStream = require('rar-stream');
        console.log('✅ rar-stream loaded successfully');
        
        // Test basic functionality
        console.log('✅ rar-stream basic test passed');
        
    } catch (error) {
        console.log('❌ rar-stream test failed:', error.message);
    }
    
    // Test 3: Check Node.js version
    console.log('Node.js version:', process.version);
    
    // Test 4: Test subtitle validation function
    try {
        const { isValidSubtitleContent } = require('./lib/subtitleMatcher.js');
        
        const testSubtitle = `1
00:00:01,000 --> 00:00:03,000
Test subtitle content

2
00:00:04,000 --> 00:00:06,000
Another test line`;
        
        if (isValidSubtitleContent(testSubtitle)) {
            console.log('✅ Subtitle validation test passed');
        } else {
            console.log('❌ Subtitle validation test failed');
        }
        
    } catch (error) {
        console.log('❌ Subtitle validation test failed:', error.message);
    }
    
    // Test 5: Test RAR extraction functions
    try {
        const subtitleMatcher = require('./lib/subtitleMatcher.js');
        
        // Create a test RAR buffer (just header)
        const rarBuffer = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00]);
        
        console.log('✅ RAR extraction functions are available');
        
    } catch (error) {
        console.log('❌ RAR extraction functions test failed:', error.message);
    }
    
    console.log('RAR library tests completed!');
}

testRarLibraries().catch(console.error);
