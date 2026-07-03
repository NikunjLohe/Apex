// =============================================================================
// tests/global.setup.js
// Runs once before all tests. Logs in with each role and saves browser storage
// state (cookies + localStorage) to disk so tests can reuse sessions.
// =============================================================================
import { test as setup, expect } from '@playwright/test'
import { CREDENTIALS } from './fixtures/test-data.js'
import path from 'path'
import fs from 'fs'

const AUTH_DIR = path.resolve('tests/.auth')

// Ensure auth state directory exists
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })

async function loginAndSave(page, credentials, stateFile) {
  if (credentials.email.includes('@apex.test')) {
    console.log(`[setup] ⏭️ Skipping ${credentials.label} (Placeholder credentials detected)`)
    return
  }

  await page.goto('/login')
  await page.waitForSelector('input[type="email"]', { timeout: 20_000 })

  await page.fill('input[type="email"]', credentials.email)
  await page.fill('input[type="password"]', credentials.password)
  await page.click('button[type="submit"]')

  // Wait until redirected away from login page
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })

  // If forced password change, handle it
  if (page.url().includes('/change-password')) {
    console.warn(`[setup] ${credentials.label} has mustChangePassword flag set. Skipping storage save.`)
    return
  }

  // Verify we land on a valid app page
  await expect(page).not.toHaveURL('/login')

  // Persist auth state
  await page.context().storageState({ path: stateFile })
  console.log(`[setup] ✓ ${credentials.label} auth state saved → ${stateFile}`)
}

setup('Save Super Admin auth state', async ({ page }) => {
  await loginAndSave(page, CREDENTIALS.superAdmin, path.join(AUTH_DIR, 'superadmin.json'))
})

setup('Save Admin auth state', async ({ page }) => {
  await loginAndSave(page, CREDENTIALS.admin, path.join(AUTH_DIR, 'admin.json'))
})

setup('Save Manager auth state', async ({ page }) => {
  await loginAndSave(page, CREDENTIALS.manager, path.join(AUTH_DIR, 'manager.json'))
})

setup('Save Agent auth state', async ({ page }) => {
  await loginAndSave(page, CREDENTIALS.agent, path.join(AUTH_DIR, 'agent.json'))
})
