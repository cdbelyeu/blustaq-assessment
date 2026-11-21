import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  transform: { '^.+\\.[jt]s$': '@swc/jest' },
  // The OpenAPI validator depends on an ESM-only package; transform it so Jest can load it.
  transformIgnorePatterns: ['/node_modules/(?!@apidevtools/json-schema-ref-parser/)'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/server.ts'],
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};

export default config;
