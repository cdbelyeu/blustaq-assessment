import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: { '^.+\\.ts$': '@swc/jest' },
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};

export default config;
