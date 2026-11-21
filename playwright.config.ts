import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT ?? 3100);
const externalBaseUrl = process.env.BASE_URL;

export default defineConfig({
  testDir: './acceptance',
  reporter: 'list',
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${port}`,
  },
  // Without BASE_URL, build and run the real server; with it, test whatever is already running there.
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'yarn build && node dist/server.js',
        url: `http://localhost:${port}/health`,
        env: { PORT: String(port), DATABASE_PATH: ':memory:' },
        reuseExistingServer: false,
      },
});
