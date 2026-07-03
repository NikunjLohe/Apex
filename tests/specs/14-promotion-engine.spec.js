// =============================================================================
// tests/specs/14-promotion-engine.spec.js
// Promotion Engine
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES } from '../fixtures/test-data.js'

test.describe('Promotion Engine', () => {

  test('PRM-001 | Admin can view Promotion Engine page', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.promotions)
    await expect(adminPage.locator('h1')).toHaveText(/Promotions/)
    
    // Check for Run button
    await expect(adminPage.locator('button:has-text("Run Promotions")')).toBeVisible()
    
    // Should render correctly
    await expect(adminPage.locator('text=Something went wrong')).not.toBeVisible()
  })

})
