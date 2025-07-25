// services/ai-service/aiService.test.js
// Unit tests for the AI Service

const AIService = require('./aiService');
const EventBus = require('../../lib/events/eventBus');
const AIWorkerPool = require('../../lib/workers/aiWorkerPool');

jest.mock('../../lib/events/eventBus');
jest.mock('../../lib/workers/aiWorkerPool');

describe('AI Service', () => {
    let service;
    let eventBus;
    let workerPool;

    beforeEach(() => {
        eventBus = new EventBus();
        workerPool = new AIWorkerPool();
        service = new AIService({ eventBus, workerPool });
    });

    it('should initialize correctly', () => {
        expect(service).toBeInstanceOf(AIService);
        expect(service.eventBus).toBeDefined();
        expect(service.aiWorkerPool).toBeDefined();
    });

    it('should handle AI enhancement requests', async () => {
        const mockContent = 'subtitle content';
        const mockEnhancedContent = 'enhanced content';
        workerPool.processSubtitle.mockResolvedValue(mockEnhancedContent);

        const data = { content: mockContent, options: {} };
        const metadata = { correlationId: 'test-id' };

        const handler = service.eventBus.on.mock.calls.find(call => call[0] === 'ai:enhance:request')[1];
        await handler(data, metadata);

        expect(workerPool.processSubtitle).toHaveBeenCalledWith(mockContent, {});
        expect(service.eventBus.publish).toHaveBeenCalledWith('ai:enhance:response', {
            success: true,
            enhancedContent: mockEnhancedContent
        }, { correlationId: 'test-id' });
    });

    it('should handle errors during AI enhancement', async () => {
        workerPool.processSubtitle.mockRejectedValue(new Error('AI error'));

        const data = { content: 'subtitle content', options: {} };
        const metadata = { correlationId: 'test-id' };

        const handler = service.eventBus.on.mock.calls.find(call => call[0] === 'ai:enhance:request')[1];
        await handler(data, metadata);

        expect(service.eventBus.publish).toHaveBeenCalledWith('ai:enhance:response', {
            success: false,
            error: 'AI error'
        }, { correlationId: 'test-id' });
    });
});