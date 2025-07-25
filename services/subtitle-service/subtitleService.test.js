// services/subtitle-service/subtitleService.test.js
// Unit tests for the Subtitle Service

const SubtitleService = require('./subtitleService');
const EventBus = require('../../lib/events/eventBus');

jest.mock('../../lib/events/eventBus');
jest.mock('../../lib/subtitleMatcher', () => ({
    getSubtitleUrlsForStremio: jest.fn()
}));

const { getSubtitleUrlsForStremio } = require('../../lib/subtitleMatcher');

describe('Subtitle Service', () => {
    let service;
    let eventBus;

    beforeEach(() => {
        eventBus = new EventBus();
        service = new SubtitleService({ eventBus });
        getSubtitleUrlsForStremio.mockClear();
    });

    it('should initialize correctly', () => {
        expect(service).toBeInstanceOf(SubtitleService);
        expect(service.eventBus).toBeDefined();
    });

    it('should handle subtitle search requests', async () => {
        const mockSubtitles = [{ id: '1', url: 'http://example.com/sub.srt', lang: 'tr' }];
        getSubtitleUrlsForStremio.mockResolvedValue(mockSubtitles);

        const data = { videoId: 'tt1234567', type: 'movie', language: 'tr' };
        const metadata = { correlationId: 'test-id' };

        // Manually trigger the event handler
        const handler = service.eventBus.on.mock.calls.find(call => call[0] === 'subtitle:search:request')[1];
        await handler(data, metadata);

        expect(getSubtitleUrlsForStremio).toHaveBeenCalledWith('tt1234567', 'movie', undefined, undefined, 'tr', undefined);
        expect(service.eventBus.publish).toHaveBeenCalledWith('subtitle:search:response', {
            success: true,
            subtitles: expect.any(Array) // Simplified check for scored subtitles
        }, { correlationId: 'test-id' });
    });

    it('should handle errors during subtitle search', async () => {
        getSubtitleUrlsForStremio.mockRejectedValue(new Error('Provider error'));

        const data = { videoId: 'tt1234567', type: 'movie', language: 'tr' };
        const metadata = { correlationId: 'test-id' };

        const handler = service.eventBus.on.mock.calls.find(call => call[0] === 'subtitle:search:request')[1];
        await handler(data, metadata);

        expect(service.eventBus.publish).toHaveBeenCalledWith('subtitle:search:response', {
            success: false,
            error: 'Provider error'
        }, { correlationId: 'test-id' });
    });
});