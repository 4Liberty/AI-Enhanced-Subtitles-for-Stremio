// Test script to verify SubDL fixes
// Run this to test the SubDL subtitle fetching and filtering

function testFilteringLogic() {
    console.log('Testing SubDL filtering logic...');
    
    // Sample data from the logs
    const sampleSubtitles = [
        {
            "lang": "turkish",
            "language": "TR",
            "url": "/subtitle/3354760-2906293.zip",
            "name": "harry-potter-and-the-deathly-hallows-part-2_turkish-2906293.zip"
        },
        {
            "lang": "turkish", 
            "language": "TR",
            "url": "/subtitle/39315-509367.rar",
            "name": "SUBDL.com::subtitles_harry-potter-and-the-deathly-hallows-part-2_turkish_509367.zip"
        }
    ];
    
    // Test the old filtering logic (what was broken)
    const oldTurkishSubs = sampleSubtitles.filter(sub => 
        sub.lang === 'tr' || sub.language === 'tr' || sub.language === 'Turkish'
    );
    
    // Test the new filtering logic (what we fixed)
    const newTurkishSubs = sampleSubtitles.filter(sub => {
        const lang = (sub.lang || '').toLowerCase();
        const language = (sub.language || '').toLowerCase();
        return lang === 'tr' || lang === 'turkish' || 
               language === 'tr' || language === 'turkish';
    });
    
    console.log('Original subtitles count:', sampleSubtitles.length);
    console.log('Old filtering result:', oldTurkishSubs.length, 'Turkish subtitles');
    console.log('New filtering result:', newTurkishSubs.length, 'Turkish subtitles');
    
    if (oldTurkishSubs.length === 0 && newTurkishSubs.length > 0) {
        console.log('✅ Fix works! Old logic failed, new logic succeeds');
    } else if (oldTurkishSubs.length > 0) {
        console.log('⚠️  Old logic already worked, but new logic is more robust');
    } else {
        console.log('❌ Both old and new logic failed');
    }
    
    if (newTurkishSubs.length > 0) {
        console.log('Selected subtitle:', newTurkishSubs[0]);
        
        // Test URL construction
        const downloadUrl = `https://dl.subdl.com${newTurkishSubs[0].url}`;
        console.log('Download URL:', downloadUrl);
        
        // Test file type detection
        const isZip = downloadUrl.endsWith('.zip');
        const isRar = downloadUrl.endsWith('.rar');
        console.log('Is ZIP?', isZip);
        console.log('Is RAR?', isRar);
        
        if (isZip || isRar) {
            console.log('✅ File type detection works correctly');
        } else {
            console.log('❌ File type detection failed');
        }
    }
}

// Run the test
testFilteringLogic();
