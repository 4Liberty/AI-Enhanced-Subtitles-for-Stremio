// jest.config.js
module.exports = {
  testEnvironment: 'node',
  verbose: true,
  collectCoverage: true,
  collectCoverageFrom: [
    'lib/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**'
  ],
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: -10
    }
  },
  testMatch: [
    '**/__tests__/**/*.js?(x)',
    '**/?(*.)+(spec|test).js?(x)'
  ],
  moduleFileExtensions: ['js', 'json', 'node'],
  transform: {},
  setupFilesAfterEnv: ['./jest.setup.js']
};