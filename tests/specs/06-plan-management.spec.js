// =============================================================================
// tests/specs/06-plan-management.spec.js
// Plan Master in Settings
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Plan Management', () => {

  test('PLN-001 | Admin can view Plan Master in Settings', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.settings)
    
    await adminPage.locator('text=Plan Master, text=Plans').click()
    
    // Plans table should load without crashing (StatusBadge fix validation)
    await expect(adminPage.locator('table th:has-text("Plan Code")').first()).toBeVisible({ timeout: TIMEOUTS.table })
    await expect(adminPage.locator('text=Something went wrong')).not.toBeVisible()
    await expect(adminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
  })

})
