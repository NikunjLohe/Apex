// =============================================================================
// tests/specs/13-monthly-payout.spec.js
// Payout Engine
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Monthly Payout Engine', () => {

  test('PAY-001 | Admin can view Payout Engine page', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.payouts)
    await expect(adminPage.locator('h1')).toHaveText(/Payout Engine/)
    
    // Check for Generate button
    await expect(adminPage.locator('button:has-text("Generate")')).toBeVisible()
    
    // Ensure table loads or empty state shows without crashing
    const tableVisible = await adminPage.locator('tbody tr').first().isVisible({ timeout: TIMEOUTS.table }).catch(()=>false)
    const emptyVisible = await adminPage.locator('text=No payouts').isVisible().catch(()=>false)
    expect(tableVisible || emptyVisible).toBeTruthy()
  })

})
