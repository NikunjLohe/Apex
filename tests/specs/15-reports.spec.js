// =============================================================================
// tests/specs/15-reports.spec.js
// Reports (Collections, Defaulters, Maturities, All Reports)
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Reports', () => {

  test('REP-001 | Admin can view Collections Report', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.collections)
    await expect(adminPage.locator('h1')).toHaveText(/Collections/)
    
    const hasData = await adminPage.locator('tbody tr').first().isVisible({ timeout: TIMEOUTS.table }).catch(()=>false)
    const hasEmpty = await adminPage.locator('text=No collections').isVisible().catch(()=>false)
    expect(hasData || hasEmpty).toBeTruthy()
  })

  test('REP-002 | Admin can view Defaulters Report', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.defaulters)
    await expect(adminPage.locator('h1')).toHaveText(/Defaulters/)
  })

  test('REP-003 | Admin can view Maturities Report', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.maturities)
    await expect(adminPage.locator('h1')).toHaveText(/Maturities/)
  })

  test('REP-004 | Super Admin can view All Reports module', async ({ superAdminPage }) => {
    await superAdminPage.goto(ROUTES.allReports)
    await expect(superAdminPage.locator('h1')).toHaveText(/All Reports/)
    // Should have multiple tabs (Plans, Agents, Customers, etc.)
    await expect(superAdminPage.locator('text=Plans')).toBeVisible()
    await expect(superAdminPage.locator('text=Agents')).toBeVisible()
  })

})
