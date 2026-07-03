// =============================================================================
// tests/specs/07-sponsor-id.spec.js
// Verifying Sponsor Code generation and linkage
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Sponsor ID', () => {

  test('SPO-001 | Agent sees their own Sponsor ID in profile or dashboard', async ({ agentPage }) => {
    await agentPage.goto(ROUTES.dashboard)
    // Most dashboards show the agent code somewhere, or in the navbar
    const bodyText = await agentPage.locator('body').innerText()
    // It should exist in the body or header
    expect(bodyText).toMatch(/AG\d{6}/i) 
  })

  test('SPO-002 | Admin can view Sponsor IDs in Members list', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.members)
    await expect(adminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
    const rowText = await adminPage.locator('tbody').innerText()
    // There should be at least one AG format ID visible
    expect(rowText).toMatch(/AG\d{6}/i)
  })

})
