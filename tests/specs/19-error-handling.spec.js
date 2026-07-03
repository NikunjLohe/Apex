// =============================================================================
// tests/specs/19-error-handling.spec.js
// 404 and Error Boundaries
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { DashboardPage } from '../pages/DashboardPage.js'

test.describe('Error Handling', () => {

  test('ERR-001 | Non-existent route shows 404 page', async ({ agentPage }) => {
    await agentPage.goto('/some/fake/route/that/does/not/exist')
    
    // Assuming a custom 404 page exists
    await expect(agentPage.locator('text=404, text=Not Found')).toBeVisible({ timeout: 5000 })
  })

})
