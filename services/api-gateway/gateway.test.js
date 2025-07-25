// services/api-gateway/gateway.test.js
// Integration tests for the API Gateway

const request = require('supertest');
const APIGateway = require('./gateway');

describe('API Gateway', () => {
    let gateway;
    let app;

    beforeAll(async () => {
        gateway = new APIGateway({
            enableServiceDiscovery: false // Disable for testing
        });
        app = gateway.app;
    });

    afterAll(async () => {
        await gateway.stop();
    });

    describe('Health Check', () => {
        it('should return a health check response', async () => {
            const res = await request(app).get('/health');
            expect(res.statusCode).toEqual(503); // No services running
            expect(res.body).toHaveProperty('healthy', false);
        });
    });

    describe('Subtitle Routes', () => {
        it('should return a 400 for invalid subtitle requests', async () => {
            const res = await request(app).get('/subtitles/invalid/tt1234567.json');
            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toEqual('Validation failed');
        });

        it('should return a 503 when no subtitle services are available', async () => {
            const res = await request(app).get('/subtitles/movie/tt1234567.json');
            expect(res.statusCode).toEqual(503);
            expect(res.body.error).toEqual('Subtitle service unavailable');
        });
    });

    describe('Manifest Route', () => {
        it('should return the Stremio manifest', async () => {
            const res = await request(app).get('/manifest.json');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('id', 'com.vlsub.opensubtitles');
        });
    });

    describe('PWA Routes', () => {
        it('should serve the index.html file', async () => {
            const res = await request(app).get('/');
            expect(res.statusCode).toEqual(200);
            expect(res.headers['content-type']).toMatch(/html/);
        });
    });
});