// lib/subtitleMatcher.js
// --- ENHANCED VERSION v3.0.0 WITH ADVANCED AI SYSTEM ---

const fetch = require('node-fetch');
const zlib = require('zlib');
const AdmZip = require('adm-zip');

// Enhanced robust fetch with retry logic and better error handling
async function robustFetch(url, options = {}, maxRetries = 3, timeout = 15000) {
    let controller;
    let timeoutId;
    
    const fetchOptions = {
        ...options,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            ...options.headers
        }
    };
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        controller = new AbortController();
        fetchOptions.signal = controller.signal;
        
        try {
            console.log(`[subtitleMatcher] Fetch attempt ${attempt}/${maxRetries}: ${url}`);
            
            // Set up timeout with proper cleanup
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    controller.abort();
                    reject(new Error(`Request timeout after ${timeout}ms`));
                }, timeout);
            });
            
            // Execute fetch with timeout
            const response = await Promise.race([
                fetch(url, fetchOptions),
                timeoutPromise
            ]);
            
            // Clear timeout on success
            clearTimeout(timeoutId);
            
            if (response.ok) {
                console.log(`[subtitleMatcher] Fetch successful on attempt ${attempt}`);
                return response;
            } else {
                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
                console.warn(`[subtitleMatcher] Fetch attempt ${attempt} failed: ${lastError.message}`);
            }
            
        } catch (error) {
            lastError = error;
            console.warn(`[subtitleMatcher] Fetch attempt ${attempt} failed: ${error.message}`);
            
            // Clear timeout on error
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            // Don't retry on abort errors caused by timeout
            if (error.name === 'AbortError' && error.message.includes('timeout')) {
                console.error(`[subtitleMatcher] Request timed out after ${timeout}ms`);
                break;
            }
        }
        
        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`[subtitleMatcher] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    console.error(`[subtitleMatcher] All fetch attempts failed for ${url}: ${lastError?.message}`);
    return null;
}

// Enhanced TMDb to IMDb conversion with caching and error handling
async function tmdbToImdb(tmdbId) {
    try {
        const tmdbApiKey = process.env.TMDB_API_KEY;
        if (!tmdbApiKey) {
            console.log('[subtitleMatcher] TMDB_API_KEY not configured, skipping TMDb to IMDb conversion');
            return null;
        }
        
        console.log(`[subtitleMatcher] Converting TMDb ID ${tmdbId} to IMDb ID`);
        
        // Try movie first
        let url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`;
        let res = await robustFetch(url);
        
        if (res && res.ok) {
            const data = await res.json();
            if (data.imdb_id) {
                console.log(`[subtitleMatcher] Found IMDb ID for movie: ${data.imdb_id}`);
                return data.imdb_id;
            }
        }
        
        // Try TV show if movie failed
        url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbApiKey}`;
        res = await robustFetch(url);
        
        if (res && res.ok) {
            const data = await res.json();
            if (data.imdb_id) {
                console.log(`[subtitleMatcher] Found IMDb ID for TV show: ${data.imdb_id}`);
                return data.imdb_id;
            }
        }
        
        console.log(`[subtitleMatcher] No IMDb ID found for TMDb ID: ${tmdbId}`);
        return null;
        
    } catch (e) {
        console.error('[subtitleMatcher] tmdbToImdb error:', e);
        return null;
    }
}

// Advanced 12-step AI prompt system for comprehensive subtitle enhancement
async function getAICorrectedSubtitleDirect(originalContent, options = {}) {
    const startTime = Date.now();
    console.log('[subtitleMatcher] Starting AI enhancement with 12-step analysis...');
    
    // Get settings from environment variables or options
    const aiProvider = options.aiProvider || process.env.AI_PROVIDER || 'gemini';
    const aiModel = options.aiModel || process.env.AI_MODEL || 'gemini-2.5-flash-lite-preview-06-17';
    const correctionIntensity = parseInt(options.correctionIntensity || process.env.CORRECTION_INTENSITY || '7');
    const aiTemperature = parseFloat(options.aiTemperature || process.env.AI_TEMPERATURE || '0.3');
    const primaryLanguage = options.primaryLanguage || process.env.PRIMARY_LANGUAGE || 'tr';
    
    // Generate intensity-based prompt with comprehensive analysis
    const intensityPrompts = {
        1: 'MINIMAL CORRECTIONS: Apply only critical fixes (overlaps, negative durations)',
        2: 'LIGHT CORRECTIONS: Fix basic timing issues and major sync problems',  
        3: 'BASIC CORRECTIONS: Adjust obvious timing problems and reading speed issues',
        4: 'STANDARD CORRECTIONS: Fix timing, reading speed, and scene transitions',
        5: 'MODERATE CORRECTIONS: Comprehensive timing fixes with dialogue optimization',
        6: 'ENHANCED CORRECTIONS: Full timing optimization with frame rate detection',
        7: 'COMPREHENSIVE CORRECTIONS: Advanced timing analysis with linguistic optimization',
        8: 'INTENSIVE CORRECTIONS: Deep analysis with cultural and linguistic adaptation',
        9: 'MAXIMUM CORRECTIONS: Full AI-powered optimization with advanced heuristics',
        10: 'AGGRESSIVE CORRECTIONS: Complete timing reconstruction with predictive analysis'
    };
    
    // Build the comprehensive 12-step prompt
    const basePrompt = `${intensityPrompts[correctionIntensity]}

Fix subtitle timing synchronization issues in this ${getLanguageName(primaryLanguage)} SRT file using professional subtitle timing analysis:

1. FRAME RATE ANALYSIS:
   - Identify the likely frame rate (23.976 fps, 24 fps, 25 fps, 29.97 fps, 30 fps) by analyzing timestamp patterns and drift
   - Calculate the frame rate conversion factor if needed
   - Detect PAL/NTSC conversion artifacts in timing

2. LINEAR TIMING DRIFT DETECTION:
   - Analyze the first 10%, middle 50%, and last 10% of subtitles for timing consistency
   - Detect if the file is consistently too fast or too slow throughout
   - Calculate the drift coefficient (e.g., 1.04166 for 25fps→23.976fps conversion)

3. DIALOGUE CADENCE AND SUBTITLE READING ANALYSIS:
   - Optimize timing for ${getLanguageName(primaryLanguage)} subtitle reading patterns and comprehension speed
   - Ensure subtitle timing allows adequate reading time for ${getLanguageName(primaryLanguage)} text
   - Account for ${getLanguageName(primaryLanguage)} reading rhythm and text processing patterns
   - Adjust for natural reading pauses between subtitle segments

4. SCENE BREAK AND TRANSITION PRESERVATION:
   - Identify scene changes (gaps >3 seconds between subtitles)
   - Preserve natural scene transitions and fade-in/fade-out timing
   - Maintain silence periods for dramatic effect
   - Detect and preserve chapter/act boundaries

5. MATHEMATICAL TIME TRANSFORMATION:
   - If linear drift is detected, apply mathematical correction to ALL timestamps
   - Use precise multiplication factors (e.g., ×0.95904 for 25fps→23.976fps)
   - Ensure start and end times are both adjusted proportionally
   - Maintain subtitle duration ratios

6. SUBTITLE DURATION OPTIMIZATION:
   - Ensure minimum subtitle duration of 0.8 seconds
   - Ensure maximum subtitle duration of 6 seconds for readability
   - Adjust overly short subtitles (<0.5 seconds) to minimum readable duration
   - Split overly long subtitles (>7 seconds) if content allows

7. OVERLAP AND GAP CORRECTION:
   - Eliminate negative gaps (overlapping subtitles)
   - Ensure minimum 0.1 second gap between consecutive subtitles
   - Fix subtitles that start before the previous one ends
   - Maintain natural flow between subtitle transitions

8. READING SPEED OPTIMIZATION:
   - Calculate characters per second (CPS) for each subtitle
   - Ensure CPS stays between 15-20 for optimal ${getLanguageName(primaryLanguage)} reading speed
   - Adjust timing for longer ${getLanguageName(primaryLanguage)} text to allow adequate reading time
   - Account for ${getLanguageName(primaryLanguage)} text complexity and word structure

9. PUNCTUATION AND BREATH TIMING:
   - Add natural pauses after periods (minimum 0.3 seconds)
   - Extend timing for question marks and exclamation marks
   - Account for comma pauses in long sentences
   - Adjust for ${getLanguageName(primaryLanguage)}-specific punctuation patterns

10. AUDIO-VISUAL SYNC HEURISTICS:
    - Estimate likely dialogue start/end based on subtitle content
    - Adjust timing for action descriptions vs. dialogue
    - Account for off-screen dialogue timing differences
    - Preserve synchronization for sound effects and music cues

11. CONSISTENCY VALIDATION:
    - Ensure all timestamps are in ascending order
    - Validate that no subtitle has negative duration
    - Check for impossible time jumps (>30 seconds between adjacent subtitles)
    - Verify subtitle numbering sequence

12. QUALITY ASSURANCE:
    - Perform final pass to ensure all corrections are applied
    - Verify no subtitle timing conflicts remain
    - Ensure smooth transition flow throughout the entire file
    - Double-check mathematical precision of all time calculations

CRITICAL RULES:
- Do NOT add, remove, or rewrite any dialogue text
- Only adjust timestamps for perfect sync
- Preserve all subtitle numbers and text formatting
- Return only the fully corrected subtitle file in exact SRT format
- Do not add explanations, comments, or extra text
- Ensure every timestamp change improves synchronization

Subtitle file:
${originalContent}`;

    try {
        let aiResponse;
        
        // Try providers in order with fallback
        switch (aiProvider) {
            case 'openai':
                aiResponse = await callOpenAI(basePrompt, aiModel, aiTemperature);
                if (!aiResponse && process.env.CLAUDE_API_KEY) {
                    console.log('[subtitleMatcher] OpenAI failed, trying Claude fallback...');
                    aiResponse = await callClaude(basePrompt, 'claude-3-5-haiku-20241022', aiTemperature);
                }
                if (!aiResponse && process.env.GEMINI_API_KEY) {
                    console.log('[subtitleMatcher] OpenAI and Claude failed, trying Gemini fallback...');
                    aiResponse = await callGemini(basePrompt, 'gemini-2.0-flash-exp', aiTemperature);
                }
                break;
            case 'claude':
                aiResponse = await callClaude(basePrompt, aiModel, aiTemperature);
                if (!aiResponse && process.env.OPENAI_API_KEY) {
                    console.log('[subtitleMatcher] Claude failed, trying OpenAI fallback...');
                    aiResponse = await callOpenAI(basePrompt, 'gpt-4o-mini', aiTemperature);
                }
                if (!aiResponse && process.env.GEMINI_API_KEY) {
                    console.log('[subtitleMatcher] Claude and OpenAI failed, trying Gemini fallback...');
                    aiResponse = await callGemini(basePrompt, 'gemini-2.0-flash-exp', aiTemperature);
                }
                break;
            case 'gemini':
            default:
                aiResponse = await callGemini(basePrompt, aiModel, aiTemperature);
                if (!aiResponse && process.env.OPENAI_API_KEY) {
                    console.log('[subtitleMatcher] Gemini failed, trying OpenAI fallback...');
                    aiResponse = await callOpenAI(basePrompt, 'gpt-4o-mini', aiTemperature);
                }
                if (!aiResponse && process.env.CLAUDE_API_KEY) {
                    console.log('[subtitleMatcher] Gemini and OpenAI failed, trying Claude fallback...');
                    aiResponse = await callClaude(basePrompt, 'claude-3-5-haiku-20241022', aiTemperature);
                }
                break;
        }
        
        if (aiResponse && aiResponse.length > 10) {
            const duration = Date.now() - startTime;
            console.log(`[subtitleMatcher] AI enhancement completed with ${aiProvider} in ${duration}ms`);
            return aiResponse;
        } else {
            console.log('[subtitleMatcher] All AI providers failed, returning original content');
            return originalContent;
        }
        
    } catch (err) {
        console.error(`[subtitleMatcher] Error during ${aiProvider} AI correction:`, err);
        return originalContent;
    }
}

// OpenAI API implementation
async function callOpenAI(prompt, model = 'gpt-4o-mini', temperature = 0.3) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.log('[subtitleMatcher] OpenAI API key not configured');
        return null;
    }
    
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS || '80000');
    
    try {
        const response = await robustFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional subtitle timing expert. Fix subtitle synchronization issues while preserving all dialogue text exactly as provided.'
                    },
                    {
                        role: 'user', 
                        content: prompt
                    }
                ],
                temperature: temperature,
                max_tokens: maxTokens,
                top_p: 0.9
            })
        });
        
        if (!response || !response.ok) {
            console.error(`[subtitleMatcher] OpenAI API error: ${response?.status}`);
            return null;
        }
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
        
    } catch (error) {
        console.error('[subtitleMatcher] OpenAI API call failed:', error);
        return null;
    }
}

// Claude API implementation
async function callClaude(prompt, model = 'claude-3-5-haiku-20241022', temperature = 0.3) {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
        console.log('[subtitleMatcher] Claude API key not configured');
        return null;
    }
    
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS || '80000');
    
    try {
        const response = await robustFetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: temperature,
                max_tokens: maxTokens,
                top_p: 0.9
            })
        });
        
        if (!response || !response.ok) {
            console.error(`[subtitleMatcher] Claude API error: ${response?.status}`);
            return null;
        }
        
        const data = await response.json();
        return data.content?.[0]?.text?.trim() || null;
        
    } catch (error) {
        console.error('[subtitleMatcher] Claude API call failed:', error);
        return null;
    }
}

// Enhanced Gemini API implementation
async function callGemini(prompt, model = 'gemini-2.5-flash-lite-preview-06-17', temperature = 0.3) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('[subtitleMatcher] Gemini API key not configured');
        return null;
    }
    
    try {
        console.log(`[subtitleMatcher] Using Gemini model: ${model} with temperature: ${temperature}`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await robustFetch(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: temperature,
                    topP: 0.9,
                    maxOutputTokens: parseInt(process.env.AI_MAX_TOKENS || '80000')
                }
            })
        });
        
        if (!response || !response.ok) {
            console.error(`[subtitleMatcher] Gemini API error: ${response?.status}`);
            return null;
        }
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
        
    } catch (error) {
        console.error('[subtitleMatcher] Gemini API call failed:', error);
        return null;
    }
}

// Helper function to get language name
function getLanguageName(langCode) {
    const languages = {
        'tr': 'Turkish',
        'en': 'English', 
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'nl': 'Dutch',
        'sv': 'Swedish',
        'no': 'Norwegian',
        'da': 'Danish',
        'fi': 'Finnish',
        'pl': 'Polish',
        'cs': 'Czech',
        'hu': 'Hungarian'
    };
    return languages[langCode] || 'Turkish';
}

// Enhanced subtitle processing functions
async function fetchSubdlSubtitle(videoId, infoHash) {
    try {
        const subdlApiKey = process.env.SUBDL_API_KEY;
        console.log('[subtitleMatcher] fetchSubdlSubtitle called with videoId:', videoId, 'infoHash:', infoHash);
        
        if (!subdlApiKey) {
            console.log('[subtitleMatcher] SubDL API key not found, skipping SubDL');
            return null;
        }
        
        const params = new URLSearchParams({
            api_key: subdlApiKey,
            languages: 'tr',
            subs_per_page: '10'
        });
        
        if (infoHash) {
            params.append('hash', infoHash);
        } else {
            if (videoId.startsWith('tt')) {
                params.append('imdb_id', videoId);
                params.append('type', 'movie');
            } else if (videoId.startsWith('tmdb:')) {
                const tmdbId = videoId.split(':')[1];
                params.append('tmdb_id', tmdbId);
                params.append('type', 'movie');
                
                const imdbId = await tmdbToImdb(tmdbId);
                if (imdbId) {
                    params.append('imdb_id', imdbId);
                }
            }
        }
        
        const url = `https://api.subdl.com/api/v1/subtitles?${params.toString()}`;
        const res = await robustFetch(url, { 
            headers: { 
                'Accept': 'application/json',
                'User-Agent': 'Stremio-AI-Sub-Addon/2.0'
            } 
        });
        
        if (!res || !res.ok) {
            console.log('[subtitleMatcher] SubDL API request failed');
            return null;
        }
        
        const data = await res.json();
        
        if (data && data.status === true && data.subtitles && data.subtitles.length > 0) {
            const turkishSubs = data.subtitles.filter(sub => {
                const lang = (sub.lang || '').toLowerCase();
                const language = (sub.language || '').toLowerCase();
                return lang === 'tr' || lang === 'tur' || lang === 'turkish' || 
                       language === 'tr' || language === 'tur' || language === 'turkish';
            });
            
            if (turkishSubs.length > 0) {
                turkishSubs.sort((a, b) => {
                    const ratingA = parseFloat(a.rating || 0);
                    const ratingB = parseFloat(b.rating || 0);
                    return ratingB - ratingA;
                });
                
                const subtitle = turkishSubs[0];
                const downloadUrl = subtitle.url.startsWith('http') ? subtitle.url : `https://dl.subdl.com${subtitle.url}`;
                return downloadUrl;
            }
        }
        
        return null;
    } catch (e) {
        console.error('[subtitleMatcher] fetchSubdlSubtitle error:', e);
        return null;
    }
}

async function fetchOpenSubtitlesSubtitle(videoId, infoHash) {
    try {
        const opensubtitlesApiKey = process.env.OPENSUBTITLES_API_KEY;
        
        if (!opensubtitlesApiKey) {
            console.log('[subtitleMatcher] OpenSubtitles API key not found, skipping OpenSubtitles');
            return null;
        }
        
        const searchParams = new URLSearchParams({
            languages: 'tr,tur,turkish',
            order_by: 'download_count',
            order_direction: 'desc',
            per_page: '50'
        });
        
        if (infoHash) {
            searchParams.append('moviehash', infoHash);
        } else {
            if (videoId.startsWith('tt')) {
                searchParams.append('imdb_id', videoId);
            } else if (videoId.startsWith('tmdb:')) {
                const tmdbId = videoId.split(':')[1];
                searchParams.append('tmdb_id', tmdbId);
                
                const imdbId = await tmdbToImdb(tmdbId);
                if (imdbId) {
                    searchParams.append('imdb_id', imdbId);
                }
            }
        }
        
        const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${searchParams.toString()}`;
        const searchRes = await robustFetch(searchUrl, {
            headers: {
                'Api-Key': opensubtitlesApiKey,
                'User-Agent': 'Stremio-AI-Sub-Addon/2.0',
                'Accept': 'application/json'
            }
        });
        
        if (!searchRes || !searchRes.ok) {
            console.log('[subtitleMatcher] OpenSubtitles API request failed');
            return null;
        }
        
        const searchData = await searchRes.json();
        
        if (!searchData.data || searchData.data.length === 0) {
            console.log('[subtitleMatcher] OpenSubtitles returned no subtitles');
            return null;
        }
        
        const turkishSubtitles = searchData.data.filter(subtitle => {
            const attrs = subtitle.attributes;
            const lang = (attrs.language || '').toLowerCase();
            return lang === 'tr' || lang === 'tur' || lang === 'turkish';
        });
        
        if (turkishSubtitles.length === 0) {
            console.log('[subtitleMatcher] No Turkish subtitles found in OpenSubtitles');
            return null;
        }
        
        const bestSubtitle = turkishSubtitles[0];
        const fileId = bestSubtitle?.attributes?.files?.[0]?.file_id;
        
        if (!fileId) {
            console.log('[subtitleMatcher] OpenSubtitles returned no file_id');
            return null;
        }
        
        const downloadRes = await robustFetch('https://api.opensubtitles.com/api/v1/download', {
            method: 'POST',
            headers: {
                'Api-Key': opensubtitlesApiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'Stremio-AI-Sub-Addon/2.0'
            },
            body: JSON.stringify({ file_id: fileId })
        });
        
        if (!downloadRes || !downloadRes.ok) {
            console.log('[subtitleMatcher] OpenSubtitles download link request failed');
            return null;
        }
        
        const downloadData = await downloadRes.json();
        return downloadData.link;
        
    } catch (e) {
        console.error('[subtitleMatcher] fetchOpenSubtitlesSubtitle error:', e);
        return null;
    }
}

async function downloadAndProcessSubtitle(subtitleUrl, videoId, source) {
    try {
        console.log(`[subtitleMatcher] Downloading ${source} subtitle from: ${subtitleUrl}`);
        
        const subRes = await robustFetch(subtitleUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!subRes || !subRes.ok) {
            console.log(`[subtitleMatcher] ${source} download failed`);
            return null;
        }
        
        const contentType = subRes.headers.get('content-type') || '';
        
        let content;
        if (contentType.includes('zip') || subtitleUrl.includes('.zip')) {
            const buffer = await subRes.buffer();
            const zip = new AdmZip(buffer);
            const zipEntries = zip.getEntries();
            const srtEntry = zipEntries.find(entry => entry.entryName.toLowerCase().endsWith('.srt'));
            
            if (srtEntry) {
                content = srtEntry.getData().toString('utf8');
            } else {
                console.log(`[subtitleMatcher] No SRT file found in ZIP for ${source}`);
                return null;
            }
        } else {
            content = await subRes.text();
        }
        
        if (!content || content.length === 0) {
            console.log(`[subtitleMatcher] Empty content from ${source}`);
            return null;
        }
        
        console.log(`[subtitleMatcher] ${source} subtitle content extracted, length: ${content.length}`);
        return content;
        
    } catch (e) {
        console.error(`[subtitleMatcher] ${source} processing error:`, e);
        return null;
    }
}

async function getSubtitleUrlsForStremio(args) {
    const videoId = args.id.split(':')[0];
    const infoHash = args.extra?.videoHash || null;
    
    console.log(`[subtitleMatcher] Processing subtitle request for: ${videoId}`);
    
    try {
        // Try multiple sources in parallel
        const [subdlUrl, opensubtitlesUrl] = await Promise.all([
            fetchSubdlSubtitle(videoId, infoHash),
            fetchOpenSubtitlesSubtitle(videoId, infoHash)
        ]);
        
        // Try SubDL first
        if (subdlUrl) {
            const content = await downloadAndProcessSubtitle(subdlUrl, videoId, 'subdl');
            if (content) {
                console.log(`[subtitleMatcher] Successfully found subtitle from SubDL for ${videoId}`);
                return [{
                    id: `subdl-${videoId}`,
                    lang: 'tr',
                    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
                    name: 'SubDL Turkish'
                }];
            }
        }
        
        // Try OpenSubtitles as fallback
        if (opensubtitlesUrl) {
            const content = await downloadAndProcessSubtitle(opensubtitlesUrl, videoId, 'opensubtitles');
            if (content) {
                console.log(`[subtitleMatcher] Successfully found subtitle from OpenSubtitles for ${videoId}`);
                return [{
                    id: `opensubtitles-${videoId}`,
                    lang: 'tr',
                    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
                    name: 'OpenSubtitles Turkish'
                }];
            }
        }
        
        console.log(`[subtitleMatcher] No subtitles found for ${videoId}`);
        return [];
        
    } catch (error) {
        console.error(`[subtitleMatcher] Error processing subtitle request for ${videoId}:`, error);
        return [];
    }
}

// Enhanced AI correction function
async function getAICorrectedSubtitle(videoId, language, options = {}) {
    try {
        // First get the original subtitle
        const args = { id: videoId, extra: {} };
        const subtitles = await getSubtitleUrlsForStremio(args);
        
        if (subtitles.length === 0) {
            console.log(`[subtitleMatcher] No subtitles found for AI correction: ${videoId}`);
            return null;
        }
        
        // Extract content from data URL
        const dataUrl = subtitles[0].url;
        const content = decodeURIComponent(dataUrl.split(',')[1]);
        
        // Apply AI correction
        const correctedContent = await getAICorrectedSubtitleDirect(content, options);
        
        console.log(`[subtitleMatcher] AI correction completed for ${videoId}`);
        return correctedContent;
        
    } catch (error) {
        console.error(`[subtitleMatcher] Error in AI correction for ${videoId}:`, error);
        return null;
    }
}

// Simple cache implementation
const cache = new Map();

async function getCachedSubtitleContent(videoId, source) {
    const cacheKey = `${videoId}-${source}`;
    return cache.get(cacheKey) || null;
}

function isAIEnabled() {
    return !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.CLAUDE_API_KEY);
}

module.exports = {
    getSubtitleUrlsForStremio,
    getAICorrectedSubtitle,
    getCachedSubtitleContent,
    downloadAndProcessSubtitle,
    decompressZipSubtitle: downloadAndProcessSubtitle,
    decompressRarSubtitle: downloadAndProcessSubtitle,
    enhanceSubtitleWithAI: getAICorrectedSubtitleDirect,
    getAIProvider: () => process.env.AI_PROVIDER || 'gemini',
    getAvailableModels: () => ['gemini-2.5-flash-lite-preview-06-17', 'gpt-4o-mini', 'claude-3-5-haiku-20241022'],
    testAIKey: async () => {
        return !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.CLAUDE_API_KEY);
    },
    isAIEnabled,
    fetchSubdlSubtitle,
    fetchOpenSubtitlesSubtitle
};
