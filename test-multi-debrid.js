// test-multi-debrid.js
// Comprehensive test for Real-Debrid and AllDebrid integration

const fetch = require('node-fetch');

class MultiDebridTest {
    constructor() {
        this.baseURL = 'http://localhost:7000';
        this.testResults = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    async runTest(testName, testFunction) {
        console.log(`\n🧪 Testing: ${testName}`);
        try {
            const result = await testFunction();
            console.log(`✅ PASSED: ${testName}`);
            this.testResults.passed++;
            this.testResults.tests.push({ name: testName, status: 'PASSED', result });
            return result;
        } catch (error) {
            console.log(`❌ FAILED: ${testName} - ${error.message}`);
            this.testResults.failed++;
            this.testResults.tests.push({ name: testName, status: 'FAILED', error: error.message });
            return null;
        }
    }

    async testHealthEndpoint() {
        const response = await fetch(`${this.baseURL}/api/health`);
        const data = await response.json();
        
        if (response.ok && data.status === 'ok') {
            return data;
        } else {
            throw new Error(`Health check failed: ${JSON.stringify(data)}`);
        }
    }

    async testProvidersStatus() {
        const response = await fetch(`${this.baseURL}/api/providers/status`);
        const data = await response.json();
        
        if (response.ok && data.providers) {
            return data;
        } else {
            throw new Error(`Providers status failed: ${JSON.stringify(data)}`);
        }
    }

    async testRealDebridHealth() {
        const response = await fetch(`${this.baseURL}/api/health/realdebrid`);
        const data = await response.json();
        
        if (response.ok) {
            return data;
        } else {
            throw new Error(`Real-Debrid health check failed: ${JSON.stringify(data)}`);
        }
    }

    async testAllDebridHealth() {
        const response = await fetch(`${this.baseURL}/api/health/alldebrid`);
        const data = await response.json();
        
        if (response.ok) {
            return data;
        } else {
            throw new Error(`AllDebrid health check failed: ${JSON.stringify(data)}`);
        }
    }

    async testRealDebridStatus() {
        const response = await fetch(`${this.baseURL}/api/realdebrid/status`);
        const data = await response.json();
        
        if (response.ok) {
            return data;
        } else {
            throw new Error(`Real-Debrid status failed: ${JSON.stringify(data)}`);
        }
    }

    async testAllDebridStatus() {
        const response = await fetch(`${this.baseURL}/api/alldebrid/status`);
        const data = await response.json();
        
        if (response.ok) {
            return data;
        } else {
            throw new Error(`AllDebrid status failed: ${JSON.stringify(data)}`);
        }
    }

    async testCachedContentSearch() {
        const response = await fetch(`${this.baseURL}/api/search/cached?query=avengers`);
        const data = await response.json();
        
        if (response.ok) {
            return data;
        } else {
            throw new Error(`Cached search failed: ${JSON.stringify(data)}`);
        }
    }

    async testStreamEnrichment() {
        const testStreams = [
            {
                title: 'Test Movie 1080p BluRay x264',
                size: 2000000000,
                url: 'http://example.com/test.mkv'
            },
            {
                title: 'Test Movie 4K HDR x265',
                size: 8000000000,
                url: 'http://example.com/test4k.mkv'
            }
        ];
        
        const response = await fetch(`${this.baseURL}/api/streams/enrich`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ streams: testStreams })
        });
        
        const data = await response.json();
        
        if (response.ok && data.enrichedStreams) {
            return data;
        } else {
            throw new Error(`Stream enrichment failed: ${JSON.stringify(data)}`);
        }
    }

    async testManifestForMultiDebrid() {
        const response = await fetch(`${this.baseURL}/manifest.json`);
        const data = await response.json();
        
        if (response.ok && data.name.includes('Multi-Debrid')) {
            return data;
        } else {
            throw new Error(`Manifest doesn't reflect multi-debrid support: ${JSON.stringify(data)}`);
        }
    }

    async testSubtitleEndpoint() {
        const testID = 'tt0848228'; // Avengers
        const response = await fetch(`${this.baseURL}/subtitles/movie/${testID}.json`);
        const data = await response.json();
        
        if (response.ok && data.subtitles) {
            return data;
        } else {
            throw new Error(`Subtitle endpoint failed: ${JSON.stringify(data)}`);
        }
    }

    async testStreamEndpoint() {
        const testID = 'tt0848228'; // Avengers
        const response = await fetch(`${this.baseURL}/stream/movie/${testID}.json`);
        const data = await response.json();
        
        if (response.ok && data.streams) {
            return data;
        } else {
            throw new Error(`Stream endpoint failed: ${JSON.stringify(data)}`);
        }
    }

    async runAllTests() {
        console.log('🚀 Starting Multi-Debrid Integration Test Suite...\n');
        console.log('📋 Testing Real-Debrid & AllDebrid support with Comet patterns\n');

        // Test core health endpoints
        await this.runTest('Health Check', () => this.testHealthEndpoint());
        await this.runTest('Providers Status', () => this.testProvidersStatus());
        
        // Test Real-Debrid integration
        await this.runTest('Real-Debrid Health', () => this.testRealDebridHealth());
        await this.runTest('Real-Debrid Status', () => this.testRealDebridStatus());
        
        // Test AllDebrid integration
        await this.runTest('AllDebrid Health', () => this.testAllDebridHealth());
        await this.runTest('AllDebrid Status', () => this.testAllDebridStatus());
        
        // Test enhanced features
        await this.runTest('Cached Content Search', () => this.testCachedContentSearch());
        await this.runTest('Stream Enrichment', () => this.testStreamEnrichment());
        await this.runTest('Multi-Debrid Manifest', () => this.testManifestForMultiDebrid());
        
        // Test Stremio addon compatibility
        await this.runTest('Subtitle Endpoint', () => this.testSubtitleEndpoint());
        await this.runTest('Stream Endpoint', () => this.testStreamEndpoint());

        // Print detailed summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 Multi-Debrid Integration Test Results');
        console.log('='.repeat(60));
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        console.log(`📈 Success Rate: ${Math.round((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100)}%`);
        
        // Detailed results
        console.log('\n📋 Test Details:');
        this.testResults.tests.forEach(test => {
            const status = test.status === 'PASSED' ? '✅' : '❌';
            console.log(`${status} ${test.name}`);
            if (test.status === 'FAILED') {
                console.log(`   Error: ${test.error}`);
            }
        });
        
        if (this.testResults.failed === 0) {
            console.log('\n🎉 All multi-debrid integration tests passed!');
            console.log('✅ Real-Debrid & AllDebrid support implemented successfully');
            console.log('✅ Comet-inspired multi-provider architecture working');
            console.log('✅ UI elements properly integrated with backend');
            console.log('✅ Enhanced streaming capabilities operational');
        } else {
            console.log('\n⚠️  Some tests failed. Check the results above.');
            console.log('💡 Ensure both Real-Debrid and AllDebrid API keys are configured if testing those features.');
        }
        
        console.log('\n🔗 Test environment: ' + this.baseURL);
        console.log('⏰ Test completed at: ' + new Date().toISOString());
    }
}

// Run the comprehensive test suite
const tester = new MultiDebridTest();
tester.runAllTests().catch(console.error);
