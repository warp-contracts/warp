module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  moduleFileExtensions: ['ts', 'js', 'node'],

  // A map from regular expressions to module names that allow to stub out resources with a single module
  moduleNameMapper: {
    '@warp/cache': '<rootDir>/src/cache/index',
    '@warp/contract': '<rootDir>/src/contract/index',
    '@warp/core': '<rootDir>/src/core/index',
    '@warp/legacy': '<rootDir>/src/legacy/index',
    '@warp/plugins': '<rootDir>/src/plugins/index',
    '@warp/logging': '<rootDir>/src/logging/index',
    '@warp/utils': '<rootDir>/src/utils/index',
    '@warp': '<rootDir>/src/index'
  },

  testPathIgnorePatterns: [
    "/.yalc/",
    "/data/",
    "/_helpers",
  ],

  testEnvironment: 'node',

  "transformIgnorePatterns": [
    "<rootDir>/node_modules/(?!@assemblyscript/.*)"
  ],


  transform: {
    '^.+\\.(ts|js)$': 'ts-jest'
  }
};
