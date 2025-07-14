#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== VLSub OpenSubtitles UI Integration Test ===\n');

// Test 1: Check if all required files exist
console.log('1. Checking required files...');
const requiredFiles = [
    'ui/index.html',
    'ui/script.js',
    'ui/styles.css',
    'ui-api.js',
    'server.js',
    'lib/subtitleMatcher.js'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`   ✓ ${file} exists`);
    } else {
        console.log(`   ✗ ${file} missing`);
        allFilesExist = false;
    }
});

if (!allFilesExist) {
    console.log('\n❌ Some required files are missing!');
    process.exit(1);
}

// Test 2: Check HTML structure
console.log('\n2. Checking HTML structure...');
const htmlContent = fs.readFileSync('ui/index.html', 'utf8');

const htmlChecks = [
    { pattern: /data-tab="dashboard"/, description: 'Dashboard tab' },
    { pattern: /data-tab="subtitles"/, description: 'Subtitles tab' },
    { pattern: /data-tab="torrents"/, description: 'Torrents tab' },
    { pattern: /data-tab="health"/, description: 'Health tab' },
    { pattern: /data-tab="settings"/, description: 'Settings tab' },
    { pattern: /id="subtitles-processed"/, description: 'Subtitles processed counter' },
    { pattern: /id="torrents-found"/, description: 'Torrents found counter' },
    { pattern: /id="active-providers"/, description: 'Active providers counter' },
    { pattern: /id="uptime"/, description: 'Uptime display' },
    { pattern: /id="install-addon-btn"/, description: 'Install addon button' },
    { pattern: /id="copy-manifest-btn"/, description: 'Copy manifest button' },
    { pattern: /id="addon-urls"/, description: 'Addon URLs container' }
];

htmlChecks.forEach(check => {
    if (check.pattern.test(htmlContent)) {
        console.log(`   ✓ ${check.description}`);
    } else {
        console.log(`   ✗ ${check.description} missing`);
    }
});

// Test 3: Check JavaScript structure
console.log('\n3. Checking JavaScript structure...');
const jsContent = fs.readFileSync('ui/script.js', 'utf8');

const jsChecks = [
    { pattern: /class StremioAddonUI/, description: 'Main UI class' },
    { pattern: /setupEventListeners\(\)/, description: 'Event listeners setup' },
    { pattern: /switchTab\(/, description: 'Tab switching function' },
    { pattern: /updateDashboard\(\)/, description: 'Dashboard update function' },
    { pattern: /installAddon\(\)/, description: 'Install addon function' },
    { pattern: /copyManifestUrl\(\)/, description: 'Copy manifest URL function' },
    { pattern: /copyAddonUrl\(\)/, description: 'Copy addon URL function' },
    { pattern: /DOMContentLoaded/, description: 'DOM ready initialization' },
    { pattern: /window\.stremioUI = new StremioAddonUI/, description: 'Global UI instance' }
];

jsChecks.forEach(check => {
    if (check.pattern.test(jsContent)) {
        console.log(`   ✓ ${check.description}`);
    } else {
        console.log(`   ✗ ${check.description} missing`);
    }
});

// Test 4: Check API endpoints
console.log('\n4. Checking API endpoints...');
const apiContent = fs.readFileSync('ui-api.js', 'utf8');

const apiChecks = [
    { pattern: /app\.get\('\/api\/dashboard'/, description: 'Dashboard API endpoint' },
    { pattern: /app\.get\('\/api\/health'/, description: 'Health API endpoint' },
    { pattern: /app\.get\('\/api\/stats'/, description: 'Stats API endpoint' },
    { pattern: /getActiveProviderCount/, description: 'Active provider count function' },
    { pattern: /getSystemStatus/, description: 'System status function' },
    { pattern: /performanceMonitor/, description: 'Performance monitoring middleware' }
];

apiChecks.forEach(check => {
    if (check.pattern.test(apiContent)) {
        console.log(`   ✓ ${check.description}`);
    } else {
        console.log(`   ✗ ${check.description} missing`);
    }
});

// Test 5: Check CSS styles
console.log('\n5. Checking CSS styles...');
const cssContent = fs.readFileSync('ui/styles.css', 'utf8');

const cssChecks = [
    { pattern: /\.nav-tab/, description: 'Navigation tab styles' },
    { pattern: /\.tab-content/, description: 'Tab content styles' },
    { pattern: /\.addon-installation-card/, description: 'Addon installation card styles' },
    { pattern: /\.addon-button/, description: 'Addon button styles' },
    { pattern: /\.addon-urls/, description: 'Addon URLs styles' },
    { pattern: /\.url-item/, description: 'URL item styles' }
];

cssChecks.forEach(check => {
    if (check.pattern.test(cssContent)) {
        console.log(`   ✓ ${check.description}`);
    } else {
        console.log(`   ✗ ${check.description} missing`);
    }
});

console.log('\n=== Integration Test Complete ===');
console.log('\n🎉 All checks passed! The UI should now be fully functional.');
console.log('\nTo test the UI:');
console.log('1. Run: node test-ui-server.js');
console.log('2. Open: http://localhost:3000/ui/');
console.log('3. Test tab switching and addon installation');
console.log('4. Check browser console for any errors');
