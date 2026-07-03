// =============================================================================
// tests/specs/02-role-permissions.spec.js
// Verifies that different roles (Agent, Manager, Admin, Super Admin)
// can only access the menus and pages they are authorized for.
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { DashboardPage } from '../pages/DashboardPage.js'
import { ROUTES } from '../fixtures/test-data.js'

test.describe('Role-Based Permissions & Navigation', () => {

  // ── SUPER ADMIN ────────────────────────────────────────────────────────
  test.describe('Super Admin', () => {
    test('ROLE-001 | Super Admin sees correct sidebar menus', async ({ superAdminPage }) => {
      const page = superAdminPage
      const dashboard = new DashboardPage(page)
      await dashboard.goto()

      // Should see Operations, Reports, Admin, Super Admin
      await dashboard.expectSidebarContains('Dashboard')
      await dashboard.expectSidebarContains('Members')
      await dashboard.expectSidebarContains('Overview')

      // Should NOT see My Earnings section (Agent only)
      await dashboard.expectSidebarNotContains('My Dashboard')
      await dashboard.expectSidebarNotContains('My Downline')
    })

    test('ROLE-002 | Super Admin cannot access /my-earnings directly (redirects to Unauthorized)', async ({ superAdminPage }) => {
      await superAdminPage.goto(ROUTES.myEarnings)
      await superAdminPage.waitForURL(/\/unauthorized/)
      await expect(superAdminPage.locator('text=Unauthorized')).toBeVisible()
    })
  })

  // ── ADMIN ──────────────────────────────────────────────────────────────
  test.describe('Admin (Rank 14+)', () => {
    test('ROLE-003 | Admin sees Admin panel but NOT Super Admin panel', async ({ adminPage }) => {
      const dashboard = new DashboardPage(adminPage)
      await dashboard.goto()

      await dashboard.expectSidebarContains('Members')
      await dashboard.expectSidebarContains('Policies')

      // No Super Admin stuff
      await dashboard.expectSidebarNotContains('Overview')
      await dashboard.expectSidebarNotContains('System Logs')
    })

    test('ROLE-004 | Admin cannot access /admin/overview directly', async ({ adminPage }) => {
      await adminPage.goto(ROUTES.overview)
      await adminPage.waitForURL(/\/unauthorized/)
    })
  })

  // ── BRANCH MANAGER ──────────────────────────────────────────────────────
  test.describe('Branch Manager (Rank 10+)', () => {
    test('ROLE-005 | Manager sees Collect Payment and Reports, but NOT Admin panel', async ({ managerPage }) => {
      const dashboard = new DashboardPage(managerPage)
      await dashboard.goto()

      await dashboard.expectSidebarContains('Collect Payment')
      await dashboard.expectSidebarContains('My Downline')

      await dashboard.expectSidebarNotContains('Members')
      await dashboard.expectSidebarNotContains('Import Center')
    })

    test('ROLE-006 | Manager cannot access /admin/members directly', async ({ managerPage }) => {
      await managerPage.goto(ROUTES.members)
      await managerPage.waitForURL(/\/unauthorized/)
    })
  })

  // ── FIELD AGENT ─────────────────────────────────────────────────────────
  test.describe('Field Agent (Rank < 10)', () => {
    test('ROLE-007 | Agent cannot see Collect Payment or Admin pages', async ({ agentPage }) => {
      const dashboard = new DashboardPage(agentPage)
      await dashboard.goto()

      await dashboard.expectSidebarContains('Dashboard')
      await dashboard.expectSidebarContains('My Downline')

      // Hidden items
      await dashboard.expectSidebarNotContains('Collect Payment')
      await dashboard.expectSidebarNotContains('Members')
      await dashboard.expectSidebarNotContains('Overview')
    })

    test('ROLE-008 | Agent cannot access /payments/collect directly', async ({ agentPage }) => {
      await agentPage.goto(ROUTES.collectPayment)
      await agentPage.waitForURL(/\/unauthorized/)
    })
  })

})
