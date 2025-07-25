// jest.setup.js
// Setup file for Jest testing environment

// Set a longer timeout for async operations
jest.setTimeout(30000);

// Mock environment variables
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.MASTER_ENCRYPTION_KEY = 'a-very-secret-key-that-is-32-bytes-long';
process.env.LOG_LEVEL = 'silent';

// Mock external services
jest.mock('node-fetch', () => require('jest-fetch-mock'));

// Global setup and teardown
beforeAll(async () => {
  // Initialize any global resources here
});

afterAll(async () => {
  // Clean up any global resources here
});