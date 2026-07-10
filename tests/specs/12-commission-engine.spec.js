// =============================================================================
// tests/specs/12-commission-engine.spec.js
// Commission structures and payouts (View only for safety)
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES } from '../fixtures/test-data.js'

test.describe('Commission Engine', () => {

  test('COM-001 | Agent sees My Earnings dashboard', async ({ agentPage }) => {
    await agentPage.goto(ROUTES.myEarnings)
    await expect(agentPage.locator('h1')).toHaveText(/Earnings/)
    
    // Check for KPI cards showing earnings amounts
    await expect(agentPage.locator('text=Pending Commission').first()).toBeVisible()
    await expect(agentPage.locator('text=Paid Commission').first()).toBeVisible()
  })

  test('COM-002 | Agent can see commission ledger', async ({ agentPage }) => {
    await agentPage.goto(ROUTES.myEarnings)
    // Ledger table should exist
    await expect(agentPage.locator('text=Income Ledger')).toBeVisible()
  })

})
