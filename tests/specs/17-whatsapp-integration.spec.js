// =============================================================================
// tests/specs/17-whatsapp-integration.spec.js
// WhatsApp integration checks
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES } from '../fixtures/test-data.js'

test.describe('WhatsApp Integration', () => {

  test('WA-001 | Settings page has WhatsApp Configuration section', async ({ superAdminPage }) => {
    await superAdminPage.goto(ROUTES.settings)
    await superAdminPage.locator('text=WhatsApp').click()
    
    // Check for API Key inputs
    await expect(superAdminPage.locator('input[type="password"]')).toBeVisible()
    await expect(superAdminPage.locator('input[type="text"]').first()).toBeVisible()
  })

})
