// services/quality-service/qualityService.test.js
// Unit tests for the Quality Service

const QualityService = require('./qualityService');
const EventBus = require('../../lib/events/eventBus');

jest.mock('../../lib/events/eventBus');

describe('Quality Service', () => {
    let service;
    let eventBus;

    beforeEach(() => {
        eventBus = new EventBus();
        service = new QualityService({ eventBus });
    });

    it('should initialize correctly', () => {
        expect(service).toBeInstanceOf(QualityService);
        expect(service.eventBus).toBeDefined();
    });

    it('should handle quality analysis requests', async () => {
        const mockSubtitle = { content: 'subtitle content' };
        const mockQualityScore = 100;
        
        // Mock the analyzeQuality method
        service.analyzeQuality = jest.fn().mockReturnValue(mockQualityScore);

        const data = { subtitle: mockSubtitle };
        const metadata = { correlationId: 'test-id' };

        const handler = service.eventBus.on.mock.calls.find(call => call[0] === 'quality:analyze:request')[1];
        await handler(data, metadata);

        expect(service.analyzeQuality).toHaveBeenCalledWith(mockSubtitle);
        expect(service.eventBus.publish).toHaveBeenCalledWith('quality:analyze:response', {
            success: true,
            qualityScore: mockQualityScore
        }, { correlationId: 'test-id' });
    });
});