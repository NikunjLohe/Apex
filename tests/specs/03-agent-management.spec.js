// =============================================================================
// tests/specs/03-agent-management.spec.js
// Create, edit, and view agents (Members)
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TEST_AGENT, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Agent Management', () => {

  test('AGT-001 | Admin can view Members list', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.members)
    await expect(adminPage.locator('h1')).toHaveText(/Members/)
    // Table should eventually load rows
    await expect(adminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
  })

  test('AGT-002 | Search filters members list', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.members)
    const searchInput = adminPage.locator('input[placeholder*="Search"]')
    await searchInput.fill('Admin') // Assuming an admin exists
    await adminPage.waitForTimeout(1000)
    const rowText = await adminPage.locator('tbody').innerText()
    expect(rowText.toLowerCase()).toContain('admin')
  })

  // Full creation usually requires form filling, this is a smoke test version
  test('AGT-003 | New Member button opens creation modal/page', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.members)
    const newBtn = adminPage.locator('button:has-text("New Member"), a:has-text("New")')
    if (await newBtn.count() > 0) {
       await newBtn.first().click()
       // Wait for modal or form
       await expect(adminPage.locator('text=Add Member, text=Create Member, form')).toBeVisible({ timeout: 5000 })
    }
  })

})
