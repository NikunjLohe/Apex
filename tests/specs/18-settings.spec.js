// =============================================================================
// tests/specs/18-settings.spec.js
// Settings Module Checks
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES } from '../fixtures/test-data.js'

test.describe('Settings Module', () => {

  test('SET-001 | Admin cannot access System Logs', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.systemLogs)
    await adminPage.waitForURL(/\/unauthorized/)
  })

  test('SET-002 | Super Admin can access System Logs', async ({ superAdminPage }) => {
    await superAdminPage.goto(ROUTES.systemLogs)
    await expect(superAdminPage.locator('h1')).toHaveText(/Logs/)
    await expect(superAdminPage.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('SET-003 | Settings page has required tabs', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.settings)
    
    await expect(adminPage.locator('text=Company Info')).toBeVisible()
    await expect(adminPage.locator('text=Rank Master')).toBeVisible()
    await expect(adminPage.locator('text=Plan Master')).toBeVisible()
    await expect(adminPage.locator('text=Commissions')).toBeVisible()
  })

})
