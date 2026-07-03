// =============================================================================
// tests/specs/01-auth.spec.js
// Authentication — Login, Logout, Session Persistence, Force Password Change
// =============================================================================
import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage.js'
import { CREDENTIALS, ROUTES } from '../fixtures/test-data.js'

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTES.login)
  })

  // ── Login Form Validation ────────────────────────────────────────────────
  test('AUTH-001 | Login page renders email + password fields and submit button', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('AUTH-002 | Login fails with empty credentials', async ({ page }) => {
    const login = new LoginPage(page)
    await login.submitButton.click()
    // Browser native validation or custom error should appear
    await expect(page).toHaveURL(/\/login/)
  })

  test('AUTH-003 | Login fails with wrong password', async ({ page }) => {
    const login = new LoginPage(page)
    await login.login(CREDENTIALS.superAdmin.email, 'WrongPassword123!')
    // Should remain on login page or show error
    await page.waitForTimeout(3000)
    const url = page.url()
    expect(url).toContain('/login')
  })

  test('AUTH-004 | Login fails with non-existent email', async ({ page }) => {
    const login = new LoginPage(page)
    await login.login('nonexistent@fake.com', 'SomePassword!')
    await page.waitForTimeout(3000)
    expect(page.url()).toContain('/login')
  })

  test('AUTH-005 | Successful Super Admin login redirects to /dashboard', async ({ page }) => {
    const login = new LoginPage(page)
    await login.loginAndWaitForDashboard(CREDENTIALS.superAdmin.email, CREDENTIALS.superAdmin.password)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('AUTH-006 | Successful Agent login redirects away from /login', async ({ page }) => {
    const login = new LoginPage(page)
    await login.loginAndWaitForDashboard(CREDENTIALS.agent.email, CREDENTIALS.agent.password)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('AUTH-007 | Unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    // No stored auth state — fresh context from beforeEach
    await page.goto(ROUTES.dashboard)
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('AUTH-008 | Unauthenticated access to /admin/members redirects to /login', async ({ page }) => {
    await page.goto(ROUTES.members)
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('AUTH-009 | Password field masks input characters', async ({ page }) => {
    const pwd = page.locator('input[type="password"]')
    await expect(pwd).toHaveAttribute('type', 'password')
  })

  test('AUTH-010 | Already-authenticated user visiting /login is redirected away', async ({ page, context }) => {
    // Login first
    const login = new LoginPage(page)
    await login.loginAndWaitForDashboard(CREDENTIALS.superAdmin.email, CREDENTIALS.superAdmin.password)
    const state = await context.storageState()

    // Open new page with same auth state
    const page2 = await context.newPage()
    await page2.goto(ROUTES.login)
    await expect(page2).not.toHaveURL(/\/login/, { timeout: 10_000 })
    await page2.close()
  })

  test('AUTH-011 | Session persists after page reload', async ({ page }) => {
    const login = new LoginPage(page)
    await login.loginAndWaitForDashboard(CREDENTIALS.superAdmin.email, CREDENTIALS.superAdmin.password)
    const urlBefore = page.url()
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
