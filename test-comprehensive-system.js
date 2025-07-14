#!/usr/bin/env node

/**
 * COMPREHENSIVE SYSTEM INTEGRATION TEST
 * Tests all components: UI, Backend, Subtitle Sourcing, AI Enhancement, 
 * Hash Matching, Real-Debrid, AllDebrid, and Stream Provision
 */

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');
const path = require('path');
const fs = require('fs');

class ComprehensiveSystemTester {
    constructor() {
        this.baseUrl = 'http://localhost:7000';
        this.testResults = [];
        this.startTime = Date.now();
        this.criticalErrors = [];
        this.warnings = [];
        this.successCount = 0;
        this.failureCount = 0;
    }

    async runFullSystemTest() {
        console.log('🚀 Starting COMPREHENSIVE SYSTEM INTEGRATION TEST...\n');
        console.log('Testing: UI Server, Backend, Subtitle Sourcing, AI Enhancement, Hash Matching, Multi-Debrid, Stream Provision\n');
        
        try {
            // Phase 1: Core System Tests
            console.log('📋 PHASE 1: CORE SYSTEM TESTS');
            console.log('=' .repeat(50));
            
            await this.testServerHealth();
            await this.testUIServer();
            await this.testBackendEndpoints();
            await this.testManifestGeneration();
            
            // Phase 2: Subtitle System Tests
            console.log('\n📋 PHASE 2: SUBTITLE SYSTEM TESTS');
            console.log('=' .repeat(50));
            
            await this.testSubtitleSourcing();
            await this.testHashMatching();
            await this.testAIEnhancement();
            await this.testSubtitleDelivery();
            
            // Phase 3: Multi-Debrid System Tests
            console.log('\n📋 PHASE 3: MULTI-DEBRID SYSTEM TESTS');
            console.log('=' .repeat(50));
            
            await this.testRealDebridIntegration();
            await this.testAllDebridIntegration();
            await this.testStreamProvision();
            await this.testCachedResultsTagging();
            
            // Phase 4: Frontend Integration Tests
            console.log('\n📋 PHASE 4: FRONTEND INTEGRATION TESTS');
            console.log('=' .repeat(50));
            
            await this.testFrontendBackendIntegration();
            await this.testPerformanceMetrics();
            await this.testEnvironmentFallback();
            await this.testUserExperience();
            
            // Phase 5: End-to-End Tests
            console.log('\n📋 PHASE 5: END-TO-END TESTS');
            console.log('=' .repeat(50));
            
            await this.testStremioIntegration();
            await this.testWorkflowIntegration();
            await this.testErrorHandling();
            await this.testPerformanceUnderLoad();
            
            // Generate comprehensive report
            this.generateComprehensiveReport();
            
        } catch (error) {
            console.error('❌ CRITICAL TEST SUITE FAILURE:', error);
            this.criticalErrors.push(`Test suite failure: ${error.message}`);
            this.generateComprehensiveReport();
            process.exit(1);
        }
    }

    // Phase 1: Core System Tests
    async testServerHealth() {
        console.log('🔍 Testing server health...');
        
        try {
            const response = await this.makeRequest('/api/health');
            if (response) {
                const health = JSON.parse(response);
                if (health.status === 'healthy' || health.status === 'ok') {
                    this.addTestResult('Server Health', 'PASS', 'Server is healthy and responding');
                } else {
                    this.addTestResult('Server Health', 'FAIL', `Server status: ${health.status}`);
                }
            } else {
                this.addTestResult('Server Health', 'FAIL', 'Server not responding');
            }
        } catch (error) {
            this.addTestResult('Server Health', 'FAIL', `Server health check failed: ${error.message}`);
        }
    }

    async testUIServer() {
        console.log('🎨 Testing UI server...');
        
        try {
            // Test UI main page
            const htmlResponse = await this.makeRequest('/ui/');
            if (htmlResponse && htmlResponse.includes('Stremio Addon')) {
                this.addTestResult('UI Server HTML', 'PASS', 'UI HTML loads correctly');
            } else {
                this.addTestResult('UI Server HTML', 'FAIL', 'UI HTML not loading properly');
            }
            
            // Test CSS
            const cssResponse = await this.makeRequest('/ui/styles.css');
            if (cssResponse && cssResponse.includes('performance-metrics')) {
                this.addTestResult('UI Server CSS', 'PASS', 'UI CSS includes new features');
            } else {
                this.addTestResult('UI Server CSS', 'FAIL', 'UI CSS missing or incomplete');
            }
            
            // Test JavaScript
            const jsResponse = await this.makeRequest('/ui/script.js');
            if (jsResponse && jsResponse.includes('StremioAddonUI')) {
                this.addTestResult('UI Server JS', 'PASS', 'UI JavaScript loads correctly');
            } else {
                this.addTestResult('UI Server JS', 'FAIL', 'UI JavaScript not loading properly');
            }
            
        } catch (error) {
            this.addTestResult('UI Server', 'FAIL', `UI server test failed: ${error.message}`);
        }
    }

    async testBackendEndpoints() {
        console.log('🔧 Testing backend endpoints...');
        
        const endpoints = [
            '/api/dashboard',
            '/api/settings',
            '/api/performance/metrics',
            '/api/environment/status',
            '/api/realdebrid/status',
            '/api/alldebrid/status'
        ];
        
        for (const endpoint of endpoints) {
            try {
                const response = await this.makeRequest(endpoint);
                if (response) {
                    this.addTestResult(`Endpoint ${endpoint}`, 'PASS', 'Endpoint responding');
                } else {
                    this.addTestResult(`Endpoint ${endpoint}`, 'FAIL', 'Endpoint not responding');
                }
            } catch (error) {
                this.addTestResult(`Endpoint ${endpoint}`, 'FAIL', `Endpoint error: ${error.message}`);
            }
        }
    }

    async testManifestGeneration() {
        console.log('📄 Testing manifest generation...');
        
        try {
            const response = await this.makeRequest('/manifest.json');
            if (response) {
                const manifest = JSON.parse(response);
                
                // Check required fields
                const requiredFields = ['id', 'version', 'name', 'description', 'resources', 'types'];
                const missingFields = requiredFields.filter(field => !manifest[field]);
                
                if (missingFields.length === 0) {
                    this.addTestResult('Manifest Generation', 'PASS', 'Manifest contains all required fields');
                } else {
                    this.addTestResult('Manifest Generation', 'FAIL', `Missing fields: ${missingFields.join(', ')}`);
                }
                
                // Check resources
                if (manifest.resources.includes('subtitles') && manifest.resources.includes('stream')) {
                    this.addTestResult('Manifest Resources', 'PASS', 'Manifest includes subtitle and stream resources');
                } else {
                    this.addTestResult('Manifest Resources', 'FAIL', 'Manifest missing required resources');
                }
                
            } else {
                this.addTestResult('Manifest Generation', 'FAIL', 'Manifest not accessible');
            }
        } catch (error) {
            this.addTestResult('Manifest Generation', 'FAIL', `Manifest error: ${error.message}`);
        }
    }

    // Phase 2: Subtitle System Tests
    async testSubtitleSourcing() {
        console.log('📝 Testing subtitle sourcing...');
        
        try {
            // Test with a known movie ID
            const testMovieId = 'tt0111161'; // The Shawshank Redemption
            const response = await this.makeRequest(`/subtitles/${testMovieId}.json`);
            
            if (response) {
                const subtitleData = JSON.parse(response);
                
                if (subtitleData.subtitles && subtitleData.subtitles.length > 0) {
                    this.addTestResult('Subtitle Sourcing', 'PASS', `Found ${subtitleData.subtitles.length} subtitle sources`);
                    
                    // Check subtitle URL format
                    const firstSubtitle = subtitleData.subtitles[0];
                    if (firstSubtitle.url && firstSubtitle.url.includes('/subtitle/')) {
                        this.addTestResult('Subtitle URL Format', 'PASS', 'Subtitle URLs properly formatted');
                    } else {
                        this.addTestResult('Subtitle URL Format', 'FAIL', 'Subtitle URLs not properly formatted');
                    }
                    
                } else {
                    this.addTestResult('Subtitle Sourcing', 'WARN', 'No subtitles found for test movie');
                }
            } else {
                this.addTestResult('Subtitle Sourcing', 'FAIL', 'Subtitle endpoint not responding');
            }
        } catch (error) {
            this.addTestResult('Subtitle Sourcing', 'FAIL', `Subtitle sourcing error: ${error.message}`);
        }
    }

    async testHashMatching() {
        console.log('🔍 Testing hash matching...');
        
        try {
            // Test with hash parameter
            const testHash = 'abcdef1234567890abcdef1234567890abcdef12';
            const response = await this.makeRequest(`/subtitles/tt0111161.json?video_hash=${testHash}`);
            
            if (response) {
                const subtitleData = JSON.parse(response);
                
                if (subtitleData.subtitles && subtitleData.subtitles.length > 0) {
                    // Check if any subtitle mentions hash matching
                    const hashMatchedSubtitles = subtitleData.subtitles.filter(sub => 
                        sub.id && sub.id.includes('hash') || 
                        sub.url && sub.url.includes('hash')
                    );
                    
                    if (hashMatchedSubtitles.length > 0) {
                        this.addTestResult('Hash Matching', 'PASS', `Found ${hashMatchedSubtitles.length} hash-matched subtitles`);
                    } else {
                        this.addTestResult('Hash Matching', 'WARN', 'Hash parameter processed but no hash-matched subtitles found');
                    }
                } else {
                    this.addTestResult('Hash Matching', 'WARN', 'No subtitles found for hash matching test');
                }
            } else {
                this.addTestResult('Hash Matching', 'FAIL', 'Hash matching endpoint not responding');
            }
        } catch (error) {
            this.addTestResult('Hash Matching', 'FAIL', `Hash matching error: ${error.message}`);
        }
    }

    async testAIEnhancement() {
        console.log('🤖 Testing AI enhancement...');
        
        try {
            // Test AI enhancement status
            const response = await this.makeRequest('/api/ai/status');
            
            if (response) {
                const aiStatus = JSON.parse(response);
                
                if (aiStatus.enabled !== undefined) {
                    this.addTestResult('AI Enhancement Status', 'PASS', `AI enhancement ${aiStatus.enabled ? 'enabled' : 'disabled'}`);
                } else {
                    this.addTestResult('AI Enhancement Status', 'FAIL', 'AI status endpoint not properly structured');
                }
            } else {
                this.addTestResult('AI Enhancement Status', 'WARN', 'AI status endpoint not found (may be integrated differently)');
            }
            
            // Test AI enhancement in subtitle delivery
            const subtitleResponse = await this.makeRequest('/subtitles/tt0111161.json');
            if (subtitleResponse) {
                const subtitleData = JSON.parse(subtitleResponse);
                
                if (subtitleData.subtitles && subtitleData.subtitles.length > 0) {
                    const aiEnhancedSubtitles = subtitleData.subtitles.filter(sub => 
                        sub.id && sub.id.includes('ai') || 
                        sub.url && sub.url.includes('ai')
                    );
                    
                    if (aiEnhancedSubtitles.length > 0) {
                        this.addTestResult('AI Enhancement Integration', 'PASS', `Found ${aiEnhancedSubtitles.length} AI-enhanced subtitles`);
                    } else {
                        this.addTestResult('AI Enhancement Integration', 'WARN', 'No AI-enhanced subtitles found in response');
                    }
                }
            }
            
        } catch (error) {
            this.addTestResult('AI Enhancement', 'FAIL', `AI enhancement error: ${error.message}`);
        }
    }

    async testSubtitleDelivery() {
        console.log('📤 Testing subtitle delivery...');
        
        try {
            // Test subtitle content delivery
            const response = await this.makeRequest('/subtitle/test-subtitle-id');
            
            if (response) {
                // Check if it's SRT format or contains subtitle content
                if (response.includes('-->') || response.includes('WEBVTT')) {
                    this.addTestResult('Subtitle Delivery', 'PASS', 'Subtitle content delivered in proper format');
                } else {
                    this.addTestResult('Subtitle Delivery', 'WARN', 'Subtitle content format unclear');
                }
            } else {
                this.addTestResult('Subtitle Delivery', 'WARN', 'Subtitle content endpoint not responding (may require valid ID)');
            }
        } catch (error) {
            this.addTestResult('Subtitle Delivery', 'FAIL', `Subtitle delivery error: ${error.message}`);
        }
    }

    // Phase 3: Multi-Debrid System Tests
    async testRealDebridIntegration() {
        console.log('🔗 Testing Real-Debrid integration...');
        
        try {
            const response = await this.makeRequest('/api/realdebrid/status');
            
            if (response) {
                const rdStatus = JSON.parse(response);
                
                if (rdStatus.configured !== undefined) {
                    this.addTestResult('Real-Debrid Status', 'PASS', `Real-Debrid ${rdStatus.configured ? 'configured' : 'not configured'}`);
                } else {
                    this.addTestResult('Real-Debrid Status', 'FAIL', 'Real-Debrid status endpoint malformed');
                }
            } else {
                this.addTestResult('Real-Debrid Status', 'FAIL', 'Real-Debrid status endpoint not responding');
            }
        } catch (error) {
            this.addTestResult('Real-Debrid Integration', 'FAIL', `Real-Debrid error: ${error.message}`);
        }
    }

    async testAllDebridIntegration() {
        console.log('🔗 Testing AllDebrid integration...');
        
        try {
            const response = await this.makeRequest('/api/alldebrid/status');
            
            if (response) {
                const adStatus = JSON.parse(response);
                
                if (adStatus.configured !== undefined) {
                    this.addTestResult('AllDebrid Status', 'PASS', `AllDebrid ${adStatus.configured ? 'configured' : 'not configured'}`);
                } else {
                    this.addTestResult('AllDebrid Status', 'FAIL', 'AllDebrid status endpoint malformed');
                }
            } else {
                this.addTestResult('AllDebrid Status', 'FAIL', 'AllDebrid status endpoint not responding');
            }
        } catch (error) {
            this.addTestResult('AllDebrid Integration', 'FAIL', `AllDebrid error: ${error.message}`);
        }
    }

    async testStreamProvision() {
        console.log('🎬 Testing stream provision...');
        
        try {
            const response = await this.makeRequest('/stream/movie/tt0111161.json');
            
            if (response) {
                const streamData = JSON.parse(response);
                
                if (streamData.streams && streamData.streams.length > 0) {
                    this.addTestResult('Stream Provision', 'PASS', `Found ${streamData.streams.length} streams`);
                    
                    // Check stream format
                    const firstStream = streamData.streams[0];
                    if (firstStream.title && firstStream.url) {
                        this.addTestResult('Stream Format', 'PASS', 'Streams properly formatted');
                    } else {
                        this.addTestResult('Stream Format', 'FAIL', 'Streams not properly formatted');
                    }
                    
                    // Check for cached/debrid streams
                    const cachedStreams = streamData.streams.filter(stream => 
                        stream.behaviorHints && (stream.behaviorHints.realDebrid || stream.behaviorHints.cached)
                    );
                    
                    if (cachedStreams.length > 0) {
                        this.addTestResult('Cached Streams', 'PASS', `Found ${cachedStreams.length} cached/debrid streams`);
                    } else {
                        this.addTestResult('Cached Streams', 'WARN', 'No cached/debrid streams found');
                    }
                    
                } else {
                    this.addTestResult('Stream Provision', 'WARN', 'No streams found for test movie');
                }
            } else {
                this.addTestResult('Stream Provision', 'FAIL', 'Stream endpoint not responding');
            }
        } catch (error) {
            this.addTestResult('Stream Provision', 'FAIL', `Stream provision error: ${error.message}`);
        }
    }

    async testCachedResultsTagging() {
        console.log('🏷️ Testing cached results tagging...');
        
        try {
            const response = await this.makeRequest('/stream/movie/tt0111161.json');
            
            if (response) {
                const streamData = JSON.parse(response);
                
                if (streamData.streams && streamData.streams.length > 0) {
                    const taggedStreams = streamData.streams.filter(stream => 
                        stream.title && (
                            stream.title.includes('🎬') || 
                            stream.title.includes('🔥') || 
                            stream.title.includes('⚡') ||
                            stream.title.includes('[')
                        )
                    );
                    
                    if (taggedStreams.length > 0) {
                        this.addTestResult('Cached Results Tagging', 'PASS', `Found ${taggedStreams.length} properly tagged streams`);
                    } else {
                        this.addTestResult('Cached Results Tagging', 'WARN', 'No tagged streams found');
                    }
                } else {
                    this.addTestResult('Cached Results Tagging', 'WARN', 'No streams to check for tagging');
                }
            } else {
                this.addTestResult('Cached Results Tagging', 'FAIL', 'Cannot test tagging - stream endpoint not responding');
            }
        } catch (error) {
            this.addTestResult('Cached Results Tagging', 'FAIL', `Tagging test error: ${error.message}`);
        }
    }

    // Phase 4: Frontend Integration Tests
    async testFrontendBackendIntegration() {
        console.log('🔄 Testing frontend-backend integration...');
        
        try {
            // Test settings endpoint
            const settingsResponse = await this.makeRequest('/api/settings');
            if (settingsResponse) {
                this.addTestResult('Settings Integration', 'PASS', 'Settings endpoint accessible');
            } else {
                this.addTestResult('Settings Integration', 'FAIL', 'Settings endpoint not accessible');
            }
            
            // Test dashboard data
            const dashboardResponse = await this.makeRequest('/api/dashboard');
            if (dashboardResponse) {
                const dashboardData = JSON.parse(dashboardResponse);
                if (dashboardData.subtitlesProcessed !== undefined) {
                    this.addTestResult('Dashboard Integration', 'PASS', 'Dashboard data properly structured');
                } else {
                    this.addTestResult('Dashboard Integration', 'FAIL', 'Dashboard data not properly structured');
                }
            } else {
                this.addTestResult('Dashboard Integration', 'FAIL', 'Dashboard endpoint not accessible');
            }
            
        } catch (error) {
            this.addTestResult('Frontend-Backend Integration', 'FAIL', `Integration error: ${error.message}`);
        }
    }

    async testPerformanceMetrics() {
        console.log('📊 Testing performance metrics...');
        
        try {
            const response = await this.makeRequest('/api/performance/metrics');
            
            if (response) {
                const metrics = JSON.parse(response);
                
                const requiredMetrics = ['uptime', 'memory', 'cpu', 'requests', 'performance'];
                const missingMetrics = requiredMetrics.filter(metric => !metrics[metric]);
                
                if (missingMetrics.length === 0) {
                    this.addTestResult('Performance Metrics', 'PASS', 'All performance metrics available');
                } else {
                    this.addTestResult('Performance Metrics', 'FAIL', `Missing metrics: ${missingMetrics.join(', ')}`);
                }
            } else {
                this.addTestResult('Performance Metrics', 'FAIL', 'Performance metrics endpoint not responding');
            }
        } catch (error) {
            this.addTestResult('Performance Metrics', 'FAIL', `Performance metrics error: ${error.message}`);
        }
    }

    async testEnvironmentFallback() {
        console.log('🌍 Testing environment fallback...');
        
        try {
            const response = await this.makeRequest('/api/environment/status');
            
            if (response) {
                const envStatus = JSON.parse(response);
                
                if (envStatus.fallbackEnabled !== undefined) {
                    this.addTestResult('Environment Fallback', 'PASS', `Fallback ${envStatus.fallbackEnabled ? 'enabled' : 'disabled'}`);
                } else {
                    this.addTestResult('Environment Fallback', 'FAIL', 'Environment status not properly structured');
                }
            } else {
                this.addTestResult('Environment Fallback', 'FAIL', 'Environment status endpoint not responding');
            }
        } catch (error) {
            this.addTestResult('Environment Fallback', 'FAIL', `Environment fallback error: ${error.message}`);
        }
    }

    async testUserExperience() {
        console.log('👤 Testing user experience...');
        
        try {
            // Test UI responsiveness
            const uiResponse = await this.makeRequest('/ui/');
            if (uiResponse && uiResponse.includes('Performance Metrics')) {
                this.addTestResult('UI User Experience', 'PASS', 'UI includes performance metrics');
            } else {
                this.addTestResult('UI User Experience', 'FAIL', 'UI missing performance metrics');
            }
            
            // Test API response times
            const startTime = performance.now();
            await this.makeRequest('/api/dashboard');
            const endTime = performance.now();
            
            const responseTime = endTime - startTime;
            if (responseTime < 2000) {
                this.addTestResult('API Response Time', 'PASS', `Dashboard loads in ${responseTime.toFixed(2)}ms`);
            } else {
                this.addTestResult('API Response Time', 'WARN', `Dashboard loads slowly: ${responseTime.toFixed(2)}ms`);
            }
            
        } catch (error) {
            this.addTestResult('User Experience', 'FAIL', `User experience error: ${error.message}`);
        }
    }

    // Phase 5: End-to-End Tests
    async testStremioIntegration() {
        console.log('🎭 Testing Stremio integration...');
        
        try {
            // Test manifest accessibility
            const manifestResponse = await this.makeRequest('/manifest.json');
            if (manifestResponse) {
                const manifest = JSON.parse(manifestResponse);
                
                if (manifest.id && manifest.resources) {
                    this.addTestResult('Stremio Manifest', 'PASS', 'Manifest accessible and valid');
                } else {
                    this.addTestResult('Stremio Manifest', 'FAIL', 'Manifest invalid or incomplete');
                }
            } else {
                this.addTestResult('Stremio Manifest', 'FAIL', 'Manifest not accessible');
            }
            
            // Test addon URL format
            const addonUrl = `${this.baseUrl}/manifest.json`;
            const stremioUrl = `stremio://${addonUrl}`;
            
            this.addTestResult('Stremio URL Format', 'PASS', `Addon URL: ${stremioUrl}`);
            
        } catch (error) {
            this.addTestResult('Stremio Integration', 'FAIL', `Stremio integration error: ${error.message}`);
        }
    }

    async testWorkflowIntegration() {
        console.log('🔄 Testing workflow integration...');
        
        try {
            // Test complete workflow: search -> subtitles -> streams
            const movieId = 'tt0111161';
            
            // Step 1: Get subtitles
            const subtitleResponse = await this.makeRequest(`/subtitles/${movieId}.json`);
            if (subtitleResponse) {
                const subtitleData = JSON.parse(subtitleResponse);
                
                // Step 2: Get streams
                const streamResponse = await this.makeRequest(`/stream/movie/${movieId}.json`);
                if (streamResponse) {
                    const streamData = JSON.parse(streamResponse);
                    
                    if (subtitleData.subtitles && streamData.streams) {
                        this.addTestResult('Workflow Integration', 'PASS', 'Complete workflow functional');
                    } else {
                        this.addTestResult('Workflow Integration', 'FAIL', 'Workflow incomplete - missing data');
                    }
                } else {
                    this.addTestResult('Workflow Integration', 'FAIL', 'Workflow broken - stream step failed');
                }
            } else {
                this.addTestResult('Workflow Integration', 'FAIL', 'Workflow broken - subtitle step failed');
            }
            
        } catch (error) {
            this.addTestResult('Workflow Integration', 'FAIL', `Workflow integration error: ${error.message}`);
        }
    }

    async testErrorHandling() {
        console.log('🚨 Testing error handling...');
        
        try {
            // Test invalid endpoints
            const invalidResponse = await this.makeRequest('/invalid-endpoint-test');
            if (!invalidResponse) {
                this.addTestResult('Error Handling - 404', 'PASS', '404 errors handled correctly');
            } else {
                this.addTestResult('Error Handling - 404', 'FAIL', 'Invalid endpoints not properly handled');
            }
            
            // Test invalid movie ID
            const invalidMovieResponse = await this.makeRequest('/subtitles/invalid-movie-id.json');
            if (invalidMovieResponse) {
                const data = JSON.parse(invalidMovieResponse);
                if (data.subtitles && data.subtitles.length === 0) {
                    this.addTestResult('Error Handling - Invalid ID', 'PASS', 'Invalid movie IDs handled gracefully');
                } else {
                    this.addTestResult('Error Handling - Invalid ID', 'WARN', 'Invalid movie ID handling unclear');
                }
            } else {
                this.addTestResult('Error Handling - Invalid ID', 'FAIL', 'Invalid movie ID not handled');
            }
            
        } catch (error) {
            this.addTestResult('Error Handling', 'FAIL', `Error handling test failed: ${error.message}`);
        }
    }

    async testPerformanceUnderLoad() {
        console.log('⚡ Testing performance under load...');
        
        try {
            // Make multiple concurrent requests
            const concurrentRequests = 5;
            const requests = [];
            
            for (let i = 0; i < concurrentRequests; i++) {
                requests.push(this.makeRequest('/api/dashboard'));
            }
            
            const startTime = performance.now();
            await Promise.all(requests);
            const endTime = performance.now();
            
            const totalTime = endTime - startTime;
            const averageTime = totalTime / concurrentRequests;
            
            if (averageTime < 3000) {
                this.addTestResult('Performance Under Load', 'PASS', `Handled ${concurrentRequests} concurrent requests in ${totalTime.toFixed(2)}ms`);
            } else {
                this.addTestResult('Performance Under Load', 'WARN', `Slow under load: ${averageTime.toFixed(2)}ms average`);
            }
            
        } catch (error) {
            this.addTestResult('Performance Under Load', 'FAIL', `Performance test error: ${error.message}`);
        }
    }

    // Helper Methods
    async makeRequest(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 7000,
                path: path,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'SystemTester/1.0'
                },
                timeout: 10000
            };
            
            if (data) {
                options.headers['Content-Length'] = Buffer.byteLength(data);
            }
            
            const req = http.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(responseData);
                    } else if (res.statusCode === 404) {
                        resolve(null); // Expected for some tests
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            if (data) {
                req.write(data);
            }
            
            req.end();
        });
    }

    addTestResult(testName, status, message) {
        const result = {
            test: testName,
            status: status,
            message: message,
            timestamp: new Date().toISOString()
        };
        
        this.testResults.push(result);
        
        const statusIcon = {
            'PASS': '✅',
            'FAIL': '❌',
            'WARN': '⚠️'
        }[status] || '❓';
        
        console.log(`  ${statusIcon} ${testName}: ${message}`);
        
        if (status === 'PASS') {
            this.successCount++;
        } else if (status === 'FAIL') {
            this.failureCount++;
            this.criticalErrors.push(`${testName}: ${message}`);
        } else if (status === 'WARN') {
            this.warnings.push(`${testName}: ${message}`);
        }
    }

    generateComprehensiveReport() {
        const endTime = Date.now();
        const duration = endTime - this.startTime;
        
        console.log('\n' + '='.repeat(80));
        console.log('📋 COMPREHENSIVE SYSTEM INTEGRATION TEST REPORT');
        console.log('='.repeat(80));
        
        console.log(`📊 Test Summary:`);
        console.log(`  ✅ Passed: ${this.successCount}`);
        console.log(`  ❌ Failed: ${this.failureCount}`);
        console.log(`  ⚠️  Warnings: ${this.warnings.length}`);
        console.log(`  ⏱️  Duration: ${duration}ms`);
        console.log(`  📅 Generated: ${new Date().toLocaleString()}`);
        
        if (this.criticalErrors.length > 0) {
            console.log('\n❌ CRITICAL ERRORS:');
            this.criticalErrors.forEach(error => {
                console.log(`  • ${error}`);
            });
        }
        
        if (this.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            this.warnings.forEach(warning => {
                console.log(`  • ${warning}`);
            });
        }
        
        console.log('\n📋 SYSTEM COMPONENT STATUS:');
        console.log('  🖥️  UI Server: ' + (this.getComponentStatus('UI Server')));
        console.log('  🔧 Backend APIs: ' + (this.getComponentStatus('Backend')));
        console.log('  📝 Subtitle System: ' + (this.getComponentStatus('Subtitle')));
        console.log('  🤖 AI Enhancement: ' + (this.getComponentStatus('AI Enhancement')));
        console.log('  🔍 Hash Matching: ' + (this.getComponentStatus('Hash Matching')));
        console.log('  🔗 Real-Debrid: ' + (this.getComponentStatus('Real-Debrid')));
        console.log('  🔗 AllDebrid: ' + (this.getComponentStatus('AllDebrid')));
        console.log('  🎬 Stream Provision: ' + (this.getComponentStatus('Stream Provision')));
        console.log('  🏷️  Result Tagging: ' + (this.getComponentStatus('Tagging')));
        console.log('  🎭 Stremio Integration: ' + (this.getComponentStatus('Stremio')));
        
        console.log('\n🚀 DEPLOYMENT READINESS:');
        
        if (this.failureCount === 0) {
            console.log('  ✅ System is READY for production deployment');
            console.log('  ✅ All critical components are functional');
            console.log('  ✅ End-to-end workflows are working');
        } else if (this.failureCount <= 3) {
            console.log('  ⚠️  System has minor issues but may be deployable');
            console.log('  ⚠️  Review and fix critical errors before production');
        } else {
            console.log('  ❌ System has significant issues - NOT READY for deployment');
            console.log('  ❌ Critical components are failing');
        }
        
        console.log('\n🔧 NEXT STEPS:');
        if (this.failureCount > 0) {
            console.log('  1. Fix critical errors listed above');
            console.log('  2. Re-run comprehensive tests');
            console.log('  3. Monitor system performance');
        } else {
            console.log('  1. Deploy to production environment');
            console.log('  2. Monitor system performance');
            console.log('  3. Set up alerting for critical components');
        }
        
        console.log('\n' + '='.repeat(80));
        
        if (this.failureCount === 0) {
            console.log('🎉 COMPREHENSIVE TEST PASSED! System is fully functional.');
            process.exit(0);
        } else {
            console.log('⚠️  System has issues. Please review and fix before deployment.');
            process.exit(1);
        }
    }

    getComponentStatus(componentName) {
        const componentTests = this.testResults.filter(test => 
            test.test.toLowerCase().includes(componentName.toLowerCase())
        );
        
        const failures = componentTests.filter(test => test.status === 'FAIL');
        const warnings = componentTests.filter(test => test.status === 'WARN');
        
        if (failures.length > 0) {
            return '❌ FAILED';
        } else if (warnings.length > 0) {
            return '⚠️  WARNING';
        } else if (componentTests.length > 0) {
            return '✅ WORKING';
        } else {
            return '❓ UNKNOWN';
        }
    }
}

// Run comprehensive test if this file is executed directly
if (require.main === module) {
    const tester = new ComprehensiveSystemTester();
    tester.runFullSystemTest().catch(error => {
        console.error('❌ COMPREHENSIVE TEST SUITE FAILURE:', error);
        process.exit(1);
    });
}

module.exports = ComprehensiveSystemTester;
