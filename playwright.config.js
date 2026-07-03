// =============================================================================
// playwright.config.js — APEX Branch Operations Portal
// =============================================================================
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve('.env.test') })

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173'

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: false,        // Firebase state must be sequential for most tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,                  // Single worker to avoid Firestore write conflicts
  timeout: 40_000,
  expect: { timeout: 12_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // ── Setup: creates persistent auth states ──────────────────────────────
    {
      name: 'setup',
      testMatch: /global\.setup\.js/,
    },

    // ── Chromium (primary) ─────────────────────────────────────────────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/superadmin.json',
      },
      dependencies: ['setup'],
      testIgnore: ['**/auth.spec.js'],
    },

    // ── Auth tests (no saved state — start unauthenticated) ───────────────
    {
      name: 'auth-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/01-auth.spec.js',
    },

    // ── Role-permission tests (uses multiple auth states) ──────────────────
    {
      name: 'role-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/02-role-permissions.spec.js',
      dependencies: ['setup'],
    },

    // ── Firefox (smoke) ────────────────────────────────────────────────────
    {
      name: 'firefox-smoke',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'tests/.auth/superadmin.json',
      },
      dependencies: ['setup'],
      testMatch: ['**/16-dashboard.spec.js', '**/10-customer-management.spec.js'],
    },
  ],
})
