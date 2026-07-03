// =============================================================================
// tests/specs/16-dashboard.spec.js
// Dashboard loading and crash resistance
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { DashboardPage } from '../pages/DashboardPage.js'

test.describe('Dashboards', () => {

  test('DASH-001 | Dashboard loads without crashing (Rules of Hooks fix validation)', async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage)
    await dashboard.goto()
    await dashboard.waitForContentLoaded()
    
    // Check that we don't have the React hook crash
    await dashboard.expectNoError()
    
    // Check that KPI cards are visible
    await expect(dashboard.kpiCards.first()).toBeVisible()
  })

  test('DASH-002 | Global search is present on dashboard', async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage)
    await dashboard.goto()
    await expect(dashboard.globalSearch).toBeVisible()
  })

})
