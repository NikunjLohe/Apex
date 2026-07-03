// =============================================================================
// tests/specs/11-policy-management.spec.js
// Policy / Plan Enrollment
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Policy Management', () => {

  test('POL-001 | Admin can view Policies list', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.policies)
    await expect(adminPage.locator('h1')).toHaveText(/Policies/)
    await expect(adminPage.locator('text=Something went wrong')).not.toBeVisible()
    
    const hasRows = await adminPage.locator('tbody tr').first().isVisible({ timeout: TIMEOUTS.table }).catch(()=>false)
    const hasEmpty = await adminPage.locator('text=No policies').isVisible().catch(()=>false)
    expect(hasRows || hasEmpty).toBeTruthy()
  })

  test('POL-002 | Policies list searchable by policy number', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.policies)
    const search = adminPage.locator('input[placeholder*="Search"]')
    await search.fill('RD-')
    await adminPage.waitForTimeout(1000)
    await expect(adminPage.locator('text=Something went wrong')).not.toBeVisible()
  })

})
