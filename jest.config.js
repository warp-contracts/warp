module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  moduleFileExtensions: ['ts', 'js'],

  // A map from regular expressions to module names that allow to stub out resources with a single module
  moduleNameMapper: {
    '@smartweave/cache': '<rootDir>/src/cache/index',
    '@smartweave/contract': '<rootDir>/src/contract/index',
    '@smartweave/core': '<rootDir>/src/core/index',
    '@smartweave/legacy': '<rootDir>/src/legacy/index',
    '@smartweave/plugins': '<rootDir>/src/plugins/index',
    '@smartweave/logging': '<rootDir>/src/logging/index',
    '@smartweave': '<rootDir>/src/index'
  },

  testEnvironment: 'node',

  transform: {
    '^.+\\.(ts)$': 'ts-jest'
  }
};
