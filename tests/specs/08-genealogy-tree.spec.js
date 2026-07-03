// =============================================================================
// tests/specs/08-genealogy-tree.spec.js
// Genealogy Tree Lazy Loading functionality
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Genealogy Tree', () => {

  test('GEN-001 | Agent can view their own Downline tree', async ({ agentPage }) => {
    await agentPage.goto(ROUTES.myDownline)
    
    // Check if the tree renders
    await expect(agentPage.locator('.react-transform-wrapper, text=Zoom In').first()).toBeVisible({ timeout: TIMEOUTS.table })
    
    // Check if at least the root node (themselves) is rendered
    await expect(agentPage.locator('text=Rank').first()).toBeVisible()
  })

  test('GEN-002 | Search works in Downline tree', async ({ agentPage }) => {
    await agentPage.goto(ROUTES.myDownline)
    
    const searchInput = agentPage.locator('input[placeholder*="Search"]')
    if (await searchInput.count() > 0) {
      await searchInput.fill('Agent')
      await agentPage.waitForTimeout(1000)
      // The tree should highlight or filter, no crash should occur
      await expect(agentPage.locator('text=Something went wrong')).not.toBeVisible()
    }
  })

})
