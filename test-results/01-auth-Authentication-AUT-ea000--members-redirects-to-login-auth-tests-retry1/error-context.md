# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-auth.spec.js >> Authentication >> AUTH-008 | Unauthenticated access to /admin/members redirects to /login
- Location: tests\specs\01-auth.spec.js:62:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/login
Call log:
  - navigating to "http://localhost:5173/login", waiting until "load"

```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/specs/01-auth.spec.js
  3  | // Authentication — Login, Logout, Session Persistence, Force Password Change
  4  | // =============================================================================
  5  | import { test, expect } from '@playwright/test'
  6  | import { LoginPage } from '../pages/LoginPage.js'
  7  | import { CREDENTIALS, ROUTES } from '../fixtures/test-data.js'
  8  | 
  9  | test.describe('Authentication', () => {
  10 |   test.beforeEach(async ({ page }) => {
> 11 |     await page.goto(ROUTES.login)
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/login
  12 |   })
  13 | 
  14 |   // ── Login Form Validation ────────────────────────────────────────────────
  15 |   test('AUTH-001 | Login page renders email + password fields and submit button', async ({ page }) => {
  16 |     await expect(page.locator('input[type="email"]')).toBeVisible()
  17 |     await expect(page.locator('input[type="password"]')).toBeVisible()
  18 |     await expect(page.locator('button[type="submit"]')).toBeVisible()
  19 |   })
  20 | 
  21 |   test('AUTH-002 | Login fails with empty credentials', async ({ page }) => {
  22 |     const login = new LoginPage(page)
  23 |     await login.submitButton.click()
  24 |     // Browser native validation or custom error should appear
  25 |     await expect(page).toHaveURL(/\/login/)
  26 |   })
  27 | 
  28 |   test('AUTH-003 | Login fails with wrong password', async ({ page }) => {
  29 |     const login = new LoginPage(page)
  30 |     await login.login(CREDENTIALS.superAdmin.email, 'WrongPassword123!')
  31 |     // Should remain on login page or show error
  32 |     await page.waitForTimeout(3000)
  33 |     const url = page.url()
  34 |     expect(url).toContain('/login')
  35 |   })
  36 | 
  37 |   test('AUTH-004 | Login fails with non-existent email', async ({ page }) => {
  38 |     const login = new LoginPage(page)
  39 |     await login.login('nonexistent@fake.com', 'SomePassword!')
  40 |     await page.waitForTimeout(3000)
  41 |     expect(page.url()).toContain('/login')
  42 |   })
  43 | 
  44 |   test('AUTH-005 | Successful Super Admin login redirects to /dashboard', async ({ page }) => {
  45 |     const login = new LoginPage(page)
  46 |     await login.loginAndWaitForDashboard(CREDENTIALS.superAdmin.email, CREDENTIALS.superAdmin.password)
  47 |     await expect(page).not.toHaveURL(/\/login/)
  48 |   })
  49 | 
  50 |   test('AUTH-006 | Successful Agent login redirects away from /login', async ({ page }) => {
  51 |     const login = new LoginPage(page)
  52 |     await login.loginAndWaitForDashboard(CREDENTIALS.agent.email, CREDENTIALS.agent.password)
  53 |     await expect(page).not.toHaveURL(/\/login/)
  54 |   })
  55 | 
  56 |   test('AUTH-007 | Unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
  57 |     // No stored auth state — fresh context from beforeEach
  58 |     await page.goto(ROUTES.dashboard)
  59 |     await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  60 |   })
  61 | 
  62 |   test('AUTH-008 | Unauthenticated access to /admin/members redirects to /login', async ({ page }) => {
  63 |     await page.goto(ROUTES.members)
  64 |     await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  65 |   })
  66 | 
  67 |   test('AUTH-009 | Password field masks input characters', async ({ page }) => {
  68 |     const pwd = page.locator('input[type="password"]')
  69 |     await expect(pwd).toHaveAttribute('type', 'password')
  70 |   })
  71 | 
  72 |   test('AUTH-010 | Already-authenticated user visiting /login is redirected away', async ({ page, context }) => {
  73 |     // Login first
  74 |     const login = new LoginPage(page)
  75 |     await login.loginAndWaitForDashboard(CREDENTIALS.superAdmin.email, CREDENTIALS.superAdmin.password)
  76 |     const state = await context.storageState()
  77 | 
  78 |     // Open new page with same auth state
  79 |     const page2 = await context.newPage()
  80 |     await page2.goto(ROUTES.login)
  81 |     await expect(page2).not.toHaveURL(/\/login/, { timeout: 10_000 })
  82 |     await page2.close()
  83 |   })
  84 | 
  85 |   test('AUTH-011 | Session persists after page reload', async ({ page }) => {
  86 |     const login = new LoginPage(page)
  87 |     await login.loginAndWaitForDashboard(CREDENTIALS.superAdmin.email, CREDENTIALS.superAdmin.password)
  88 |     const urlBefore = page.url()
  89 |     await page.reload()
  90 |     await page.waitForLoadState('networkidle')
  91 |     await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
  92 |   })
  93 | })
  94 | 
```