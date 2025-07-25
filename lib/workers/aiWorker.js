// lib/workers/aiWorker.js
// AI Processing Worker Thread

const { parentPort, workerData } = require('worker_threads');

// Import AI processing functions
let getAICorrectedSubtitleDirect;
let callGemini, callOpenAI, callClaude;

// Dynamically import AI functions to avoid circular dependencies
async function initializeAIFunctions() {
    try {
        // Import AI helper functions
        const aiHelpers = await import('../aiHelpers.js').catch(() => null);
        if (aiHelpers) {
            callGemini = aiHelpers.callGemini;
            callOpenAI = aiHelpers.callOpenAI;
            callClaude = aiHelpers.callClaude;
        }
        
        // Fallback: implement basic AI calling functions
        if (!callGemini || !callOpenAI || !callClaude) {
            await initializeFallbackAIFunctions();
        }
        
        // Initialize the main AI correction function
        getAICorrectedSubtitleDirect = createAICorrectionFunction();
        
    } catch (error) {
        console.error('[AIWorker] Error initializing AI functions:', error);
        // Create minimal fallback functions
        await initializeFallbackAIFunctions();
        getAICorrectedSubtitleDirect = createFallbackAICorrectionFunction();
    }
}

// Fallback AI functions if imports fail
async function initializeFallbackAIFunctions() {
    const fetch = require('node-fetch');
    
    callGemini = async (prompt, model = 'gemini-2.0-flash-exp', temperature = 0.3) => {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) return null;
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature }
                })
            });
            
            if (!response.ok) return null;
            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        } catch (error) {
            console.error('[AIWorker] Gemini API error:', error);
            return null;
        }
    };
    
    callOpenAI = async (prompt, model = 'gpt-4o-mini', temperature = 0.3) => {
        try {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) return null;
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature
                })
            });
            
            if (!response.ok) return null;
            const data = await response.json();
            return data.choices?.[0]?.message?.content || null;
        } catch (error) {
            console.error('[AIWorker] OpenAI API error:', error);
            return null;
        }
    };
    
    callClaude = async (prompt, model = 'claude-3-5-haiku-20241022', temperature = 0.3) => {
        try {
            const apiKey = process.env.CLAUDE_API_KEY;
            if (!apiKey) return null;
            
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 4000,
                    temperature,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            
            if (!response.ok) return null;
            const data = await response.json();
            return data.content?.[0]?.text || null;
        } catch (error) {
            console.error('[AIWorker] Claude API error:', error);
            return null;
        }
    };
}

// Create the main AI correction function
function createAICorrectionFunction() {
    return async function(originalContent, options = {}) {
        const startTime = Date.now();
        
        // Get settings from options or environment variables
        const aiProvider = options.aiProvider || process.env.AI_PROVIDER || 'gemini';
        const aiModel = options.aiModel || process.env.AI_MODEL || 'gemini-2.0-flash-exp';
        const correctionIntensity = parseInt(options.correctionIntensity || process.env.CORRECTION_INTENSITY || '7');
        const aiTemperature = parseFloat(options.aiTemperature || process.env.AI_TEMPERATURE || '0.3');
        const primaryLanguage = options.primaryLanguage || process.env.PRIMARY_LANGUAGE || 'tr';
        
        // Generate intensity-based prompt
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
        
        const languageNames = {
            'tr': 'Turkish',
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German'
        };
        
        const languageName = languageNames[primaryLanguage] || 'Turkish';
        
        // Build comprehensive prompt
        const basePrompt = `${intensityPrompts[correctionIntensity]}

Fix subtitle timing synchronization issues in this ${languageName} SRT file using professional subtitle timing analysis:

1. FRAME RATE ANALYSIS:
   - Identify the likely frame rate (23.976 fps, 24 fps, 25 fps, 29.97 fps, 30 fps) by analyzing timestamp patterns and drift
   - Calculate the frame rate conversion factor if needed
   - Detect PAL/NTSC conversion artifacts in timing

2. LINEAR TIMING DRIFT DETECTION:
   - Analyze the first 10%, middle 50%, and last 10% of subtitles for timing consistency
   - Detect if the file is consistently too fast or too slow throughout
   - Calculate the drift coefficient (e.g., 1.04166 for 25fps→23.976fps conversion)

3. DIALOGUE CADENCE AND SUBTITLE READING ANALYSIS:
   - Optimize timing for ${languageName} subtitle reading patterns and comprehension speed
   - Ensure subtitle timing allows adequate reading time for ${languageName} text
   - Account for ${languageName} reading rhythm and text processing patterns
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
   - Ensure CPS stays between 15-20 for optimal ${languageName} reading speed
   - Adjust timing for longer ${languageName} text to allow adequate reading time
   - Account for ${languageName} text complexity and word structure

9. PUNCTUATION AND BREATH TIMING:
   - Add natural pauses after periods (minimum 0.3 seconds)
   - Extend timing for question marks and exclamation marks
   - Account for comma pauses in long sentences
   - Adjust for ${languageName}-specific punctuation patterns

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
                        aiResponse = await callClaude(basePrompt, 'claude-3-5-haiku-20241022', aiTemperature);
                    }
                    if (!aiResponse && process.env.GEMINI_API_KEY) {
                        aiResponse = await callGemini(basePrompt, 'gemini-2.0-flash-exp', aiTemperature);
                    }
                    break;
                case 'claude':
                    aiResponse = await callClaude(basePrompt, aiModel, aiTemperature);
                    if (!aiResponse && process.env.OPENAI_API_KEY) {
                        aiResponse = await callOpenAI(basePrompt, 'gpt-4o-mini', aiTemperature);
                    }
                    if (!aiResponse && process.env.GEMINI_API_KEY) {
                        aiResponse = await callGemini(basePrompt, 'gemini-2.0-flash-exp', aiTemperature);
                    }
                    break;
                case 'gemini':
                default:
                    aiResponse = await callGemini(basePrompt, aiModel, aiTemperature);
                    if (!aiResponse && process.env.OPENAI_API_KEY) {
                        aiResponse = await callOpenAI(basePrompt, 'gpt-4o-mini', aiTemperature);
                    }
                    if (!aiResponse && process.env.CLAUDE_API_KEY) {
                        aiResponse = await callClaude(basePrompt, 'claude-3-5-haiku-20241022', aiTemperature);
                    }
                    break;
            }
            
            if (aiResponse && aiResponse.length > 10) {
                const duration = Date.now() - startTime;
                return aiResponse;
            } else {
                return originalContent;
            }
        } catch (err) {
            console.error(`[AIWorker] Error during ${aiProvider} AI correction:`, err);
            return originalContent;
        }
    };
}

// Fallback AI correction function
function createFallbackAICorrectionFunction() {
    return async function(originalContent, options = {}) {
        // Simple timing validation and basic fixes
        try {
            const lines = originalContent.split('\n');
            const fixedLines = [];
            let subtitleIndex = 1;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line.includes('-->')) {
                    // Basic timing validation
                    const timeParts = line.split('-->');
                    if (timeParts.length === 2) {
                        const startTime = timeParts[0].trim();
                        const endTime = timeParts[1].trim();
                        
                        // Add subtitle index if missing
                        if (fixedLines.length === 0 || !fixedLines[fixedLines.length - 1].match(/^\d+$/)) {
                            fixedLines.push(`${subtitleIndex}`);
                            subtitleIndex++;
                        }
                        
                        fixedLines.push(line);
                        
                        // Get subtitle text
                        i++;
                        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
                            fixedLines.push(lines[i]);
                            i++;
                        }
                        fixedLines.push('');
                        i--; // Adjust for loop increment
                    }
                }
            }
            
            return fixedLines.join('\n');
        } catch (error) {
            console.error('[AIWorker] Fallback processing error:', error);
            return originalContent;
        }
    };
}

// Worker message handler
async function handleMessage(message) {
    const { type, jobId, content, options } = message;
    
    switch (type) {
        case 'process_subtitle':
            await processSubtitleJob(jobId, content, options);
            break;
        
        case 'translate_subtitle':
            await processTranslationJob(jobId, content, options);
            break;
            
        default:
            console.warn(`[AIWorker] Unknown message type: ${type}`);
    }
}

// Process subtitle job
async function processSubtitleJob(jobId, content, options) {
    const startTime = Date.now();
    
    try {
        console.log(`[AIWorker ${workerData.workerId}] Processing job ${jobId}`);
        
        // Validate input
        if (!content || typeof content !== 'string') {
            throw new Error('Invalid subtitle content provided');
        }
        
        // Process with AI
        const result = await getAICorrectedSubtitleDirect(content, options);
        
        const processingTime = Date.now() - startTime;
        
        // Send success result
        parentPort.postMessage({
            type: 'job_completed',
            jobId,
            result,
            processingTime
        });
        
        console.log(`[AIWorker ${workerData.workerId}] Job ${jobId} completed in ${processingTime}ms`);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        console.error(`[AIWorker ${workerData.workerId}] Job ${jobId} failed:`, error);
        
        // Send error result
        parentPort.postMessage({
            type: 'job_error',
            jobId,
            error: error.message,
            processingTime
        });
    }
}

// Process translation job
async function processTranslationJob(jobId, content, options) {
    const startTime = Date.now();
    
    try {
        console.log(`[AIWorker ${workerData.workerId}] Processing translation job ${jobId}`);
        
        // Validate input
        if (!content || typeof content !== 'string') {
            throw new Error('Invalid subtitle content provided');
        }
        
        // Process with AI
        const result = await getAITranslatedSubtitle(content, options);
        
        const processingTime = Date.now() - startTime;
        
        // Send success result
        parentPort.postMessage({
            type: 'job_completed',
            jobId,
            result,
            processingTime
        });
        
        console.log(`[AIWorker ${workerData.workerId}] Job ${jobId} completed in ${processingTime}ms`);
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        console.error(`[AIWorker ${workerData.workerId}] Job ${jobId} failed:`, error);
        
        // Send error result
        parentPort.postMessage({
            type: 'job_error',
            jobId,
            error: error.message,
            processingTime
        });
    }
}

// Create AI translation function
async function getAITranslatedSubtitle(content, options = {}) {
    const { sourceLang, targetLang } = options;
    
    const prompt = `Translate this ${sourceLang} subtitle to ${targetLang}, maintaining timing and context:

${content}

Rules:
- Keep all timestamps exactly the same
- Maintain subtitle numbering
- Preserve line breaks and formatting
- Use natural ${targetLang} expressions
- Keep technical terms appropriate for the content type`;

    // This is a simplified version. In a real scenario, you'd call the AI provider
    // similar to the getAICorrectedSubtitleDirect function.
    // For this example, we'll just return a placeholder.
    
    // Replace this with actual AI call
    const translatedContent = await callGemini(prompt);
    
    return translatedContent || `--- TRANSLATION FAILED ---\n\n${content}`;
}

// Initialize worker
async function initializeWorker() {
    try {
        console.log(`[AIWorker ${workerData.workerId}] Initializing...`);
        
        // Initialize AI functions
        await initializeAIFunctions();
        
        // Set up message handler
        parentPort.on('message', handleMessage);
        
        // Send ready signal
        parentPort.postMessage({
            type: 'worker_ready',
            workerId: workerData.workerId
        });
        
        console.log(`[AIWorker ${workerData.workerId}] Ready for processing`);
        
    } catch (error) {
        console.error(`[AIWorker ${workerData.workerId}] Initialization failed:`, error);
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error(`[AIWorker ${workerData.workerId}] Uncaught exception:`, error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[AIWorker ${workerData.workerId}] Unhandled rejection:`, reason);
    process.exit(1);
});

// Start worker
initializeWorker();
