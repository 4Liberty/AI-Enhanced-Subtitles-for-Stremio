// services/streaming-service/streamingService.test.js
// Unit tests for the Streaming Service

const StreamingService = require('./streamingService');
const EventBus = require('../../lib/events/eventBus');
const { searchRealDebrid } = require('../../lib/realDebridSearch');
const { enrichStreams } = require('../../lib/streamEnricher');

jest.mock('../../lib/events/eventBus');
jest.mock('../../lib/realDebridSearch', () => ({
    searchRealDebrid: jest.fn()
}));
jest.mock('../../lib/streamEnricher', () => ({
    enrichStreams: jest.fn()
}));

describe('Streaming Service', () => {
    let service;
    let eventBus;

    beforeEach(() => {
        eventBus = new EventBus();
        service = new StreamingService({ eventBus });
        searchRealDebrid.mockClear();
        enrichStreams.mockClear();
    });

    it('should initialize correctly', () => {
        expect(service).toBeInstanceOf(StreamingService);
        expect(service.eventBus).toBeDefined();
    });

    it('should handle Real-Debrid search requests', async () => {
        const mockStreams = [{ url: 'http://example.com/stream.mp4' }];
        searchRealDebrid.mockResolvedValue(mockStreams);

        const data = { imdbId: 'tt1234567', type: 'movie' };
        const metadata = { correlationId: 'test-id' };

        const handler = service.eventBus.on.mock.calls.find(call => call[0] === 'streaming:realdebrid:search')[1];
        await handler(data, metadata);

        expect(searchRealDebrid).toHaveBeenCalledWith({ imdb_id: 'tt1234567', type: 'movie', season: undefined, episode: undefined });
        expect(service.eventBus.publish).toHaveBeenCalledWith('streaming:realdebrid:response', {
            success: true,
            streams: mockStreams
        }, { correlationId: 'test-id' });
    });

    it('should handle stream enrichment requests', async () => {
        const mockStreams = [{ url: 'http://example.com/stream.mp4' }];
        const mockEnrichedStreams = [{ url: 'http://example.com/stream.mp4', quality: '1080p' }];
        enrichStreams.mockResolvedValue(mockEnrichedStreams);

        const data = { streams: mockStreams };
        const metadata = { correlationId: 'test-id' };

        const handler = service.eventBus.on.mock.calls.find(call => call[0] === 'streaming:enrich')[1];
        await handler(data, metadata);

        expect(enrichStreams).toHaveBeenCalledWith(mockStreams);
        expect(service.eventBus.publish).toHaveBeenCalledWith('streaming:enrich:response', {
            success: true,
            enrichedStreams: mockEnrichedStreams
        }, { correlationId: 'test-id' });
    });
});