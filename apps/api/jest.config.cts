/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  // paket workspace diekspos sebagai source saat typecheck (customConditions),
  // jadi jest juga harus membaca src-nya, bukan dist ESM
  moduleNameMapper: {
    '^@waddle/(protocol|db|engine)$': '<rootDir>/../../packages/$1/src/index.ts',
    '^@waddle/db/auth$': '<rootDir>/../../packages/db/src/auth-entry.ts',
  },
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
