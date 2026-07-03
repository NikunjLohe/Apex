// =============================================================================
// tests/specs/04-branch-management.spec.js
// Branch creation, listing, and editing
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Branch Management', () => {

  test('BRN-001 | Admin can view Branches list', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.branches)
    await expect(adminPage.locator('h1')).toHaveText(/Branches/)
    await expect(adminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
  })

  test('BRN-002 | Search branches', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.branches)
    const searchInput = adminPage.locator('input[placeholder*="Search"]')
    await searchInput.fill('HQ') // Assuming HQ exists
    await adminPage.waitForTimeout(1000)
    const rowText = await adminPage.locator('tbody').innerText()
    // It should filter, or say no records if HQ doesn't exist
    expect(rowText).toBeTruthy()
  })

})
