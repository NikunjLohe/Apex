// =============================================================================
// tests/specs/05-rank-management.spec.js
// Rank Master in Settings
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Rank Management', () => {

  test('RNK-001 | Super Admin can view Rank Master in Settings', async ({ superAdminPage }) => {
    await superAdminPage.goto(ROUTES.settings)
    
    // Click Rank Master tab
    await superAdminPage.locator('text=Rank Master, text=Ranks').click()
    
    // Ranks table should load
    await expect(superAdminPage.locator('table th:has-text("Rank Code")').first()).toBeVisible({ timeout: TIMEOUTS.table })
    await expect(superAdminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
  })

  test('RNK-002 | Ranks table does not crash (StatusBadge fix validation)', async ({ superAdminPage }) => {
    await superAdminPage.goto(ROUTES.settings)
    await superAdminPage.locator('text=Rank Master, text=Ranks').click()
    // If it crashed, Error Boundary would show
    await expect(superAdminPage.locator('text=Something went wrong')).not.toBeVisible()
    await expect(superAdminPage.locator('tbody tr').first()).toBeVisible()
  })

})
