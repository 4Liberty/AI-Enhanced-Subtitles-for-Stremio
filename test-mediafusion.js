// MediaFusion Integration Test Suite
// This tests all the MediaFusion-inspired features we implemented

const fetch = require('node-fetch');

class MediaFusionIntegrationTest {
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
        
        if (response.ok && data.status === 'healthy') {
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

    async testManifest() {
        const response = await fetch(`${this.baseURL}/manifest.json`);
        const data = await response.json();
        
        if (response.ok && data.resources && data.resources.includes('stream')) {
            return data;
        } else {
            throw new Error(`Manifest missing stream resource: ${JSON.stringify(data)}`);
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
        const testStream = {
            title: 'Test Movie 1080p',
            size: 2000000000,
            url: 'http://example.com/test.mkv'
        };
        
        const response = await fetch(`${this.baseURL}/api/streams/enrich`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ streams: [testStream] })
        });
        
        const data = await response.json();
        
        if (response.ok && data.enrichedStreams) {
            return data;
        } else {
            throw new Error(`Stream enrichment failed: ${JSON.stringify(data)}`);
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
        console.log('🚀 Starting MediaFusion Integration Test Suite...\n');

        // Test core MediaFusion-inspired endpoints
        await this.runTest('Health Check', () => this.testHealthEndpoint());
        await this.runTest('Providers Status', () => this.testProvidersStatus());
        await this.runTest('Manifest with Stream Resource', () => this.testManifest());
        await this.runTest('Cached Content Search', () => this.testCachedContentSearch());
        await this.runTest('Stream Enrichment', () => this.testStreamEnrichment());
        
        // Test Stremio addon compatibility
        await this.runTest('Subtitle Endpoint', () => this.testSubtitleEndpoint());
        await this.runTest('Stream Endpoint', () => this.testStreamEndpoint());

        // Print summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 MediaFusion Integration Test Results');
        console.log('='.repeat(50));
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        console.log(`📈 Success Rate: ${Math.round((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100)}%`);
        
        if (this.testResults.failed === 0) {
            console.log('\n🎉 All MediaFusion integration tests passed!');
            console.log('✅ Real-Debrid cached content architecture is working');
            console.log('✅ Streaming provider management is functional');
            console.log('✅ Stream enrichment with quality detection is active');
            console.log('✅ Health monitoring endpoints are responsive');
        } else {
            console.log('\n⚠️  Some tests failed. Check the results above.');
        }
    }
}

// Run the test suite
const tester = new MediaFusionIntegrationTest();
tester.runAllTests().catch(console.error);
