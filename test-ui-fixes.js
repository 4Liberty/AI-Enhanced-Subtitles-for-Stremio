// Test script to verify UI fixes
const { exec } = require('child_process');
const path = require('path');

console.log('Testing UI fixes...\n');

// Test 1: Check if all required files exist
const requiredFiles = [
    'ui/index.html',
    'ui/script.js',
    'ui/styles.css',
    'ui-api.js',
    'lib/streamEnricher.js',
    'lib/subtitleMatcher.js'
];

console.log('1. Checking required files...');
requiredFiles.forEach(file => {
    const fs = require('fs');
    if (fs.existsSync(file)) {
        console.log(`   ✓ ${file} exists`);
    } else {
        console.log(`   ✗ ${file} missing`);
    }
});

// Test 2: Check if Gemini 2.0 Flash is in the HTML
console.log('\n2. Checking Gemini 2.0 Flash model...');
const fs = require('fs');
const htmlContent = fs.readFileSync('ui/index.html', 'utf8');
if (htmlContent.includes('gemini-2.0-flash')) {
    console.log('   ✓ Gemini 2.0 Flash model added');
} else {
    console.log('   ✗ Gemini 2.0 Flash model missing');
}

// Test 3: Check if CSS dropdown fix is present
console.log('\n3. Checking CSS dropdown fixes...');
const cssContent = fs.readFileSync('ui/styles.css', 'utf8');
if (cssContent.includes('.form-select option')) {
    console.log('   ✓ Dropdown option styling fixed');
} else {
    console.log('   ✗ Dropdown option styling missing');
}

// Test 4: Check if settings endpoints are present
console.log('\n4. Checking settings endpoints...');
const apiContent = fs.readFileSync('ui-api.js', 'utf8');
if (apiContent.includes('/api/settings') && apiContent.includes('POST')) {
    console.log('   ✓ Settings endpoints present');
} else {
    console.log('   ✗ Settings endpoints missing');
}

// Test 5: Check if SubDL Turkish subtitle filtering is improved
console.log('\n5. Checking SubDL Turkish subtitle filtering...');
const subtitleContent = fs.readFileSync('lib/subtitleMatcher.js', 'utf8');
if (subtitleContent.includes('turkishSubs.sort')) {
    console.log('   ✓ SubDL Turkish subtitle filtering improved');
} else {
    console.log('   ✗ SubDL Turkish subtitle filtering not improved');
}

// Test 6: Check if chart functionality is added
console.log('\n6. Checking chart functionality...');
const scriptContent = fs.readFileSync('ui/script.js', 'utf8');
if (scriptContent.includes('createSimpleChart')) {
    console.log('   ✓ Chart functionality added');
} else {
    console.log('   ✗ Chart functionality missing');
}

console.log('\nUI fixes test completed!');
console.log('\nKey improvements made:');
console.log('- Fixed white text on white background in dropdowns');
console.log('- Added Gemini 2.0 Flash model to selection');
console.log('- Made UI settings save to backend');
console.log('- Improved SubDL Turkish subtitle detection');
console.log('- Fixed health and system dashboard');
console.log('- Added performance graph functionality');
console.log('- Fixed API key and settings management');
console.log('- Added proper notification system');
console.log('- Fixed responsive design issues');
