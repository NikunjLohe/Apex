// =============================================================================
// tests/fixtures/auth.fixture.js
// Reusable Playwright fixture that injects an authenticated page context.
// =============================================================================
import { test as base } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage.js'
import { CREDENTIALS } from './test-data.js'

/**
 * Extended test fixture with pre-authenticated page contexts.
 * Usage:
 *   import { test } from '../fixtures/auth.fixture.js'
 *   test('my test', async ({ superAdminPage }) => { ... })
 */
export const test = base.extend({
  // Super Admin authenticated page
  superAdminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: 'tests/.auth/superadmin.json',
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },

  // Admin authenticated page (rank 14)
  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: 'tests/.auth/admin.json',
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },

  // Branch Manager authenticated page (rank 10)
  managerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: 'tests/.auth/manager.json',
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },

  // Field Agent authenticated page (rank 1)
  agentPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: 'tests/.auth/agent.json',
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },

  // Fresh unauthenticated page
  guestPage: async ({ browser }, use) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },
})

export { expect } from '@playwright/test'
