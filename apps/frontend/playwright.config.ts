import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '/tmp/vidaplena-frontend-test-results',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3400', trace: 'retain-on-failure' },
  projects: [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }],
  webServer: {
    command: 'yarn dev --hostname 127.0.0.1 --port 3400',
    url: 'http://127.0.0.1:3400/login',
    reuseExistingServer: false,
    timeout: 120000,
    env: { NEXT_PUBLIC_API_ORIGIN: 'http://127.0.0.1:3434' },
  },
})
