# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-agent-management.spec.js >> Agent Management >> AGT-003 | New Member button opens creation modal/page
- Location: tests\specs\03-agent-management.spec.js:27:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/members
Call log:
  - navigating to "http://localhost:5173/admin/members", waiting until "load"

```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/specs/03-agent-management.spec.js
  3  | // Create, edit, and view agents (Members)
  4  | // =============================================================================
  5  | import { test, expect } from '../fixtures/auth.fixture.js'
  6  | import { ROUTES, TEST_AGENT, TIMEOUTS } from '../fixtures/test-data.js'
  7  | 
  8  | test.describe('Agent Management', () => {
  9  | 
  10 |   test('AGT-001 | Admin can view Members list', async ({ adminPage }) => {
  11 |     await adminPage.goto(ROUTES.members)
  12 |     await expect(adminPage.locator('h1')).toHaveText(/Members/)
  13 |     // Table should eventually load rows
  14 |     await expect(adminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
  15 |   })
  16 | 
  17 |   test('AGT-002 | Search filters members list', async ({ adminPage }) => {
  18 |     await adminPage.goto(ROUTES.members)
  19 |     const searchInput = adminPage.locator('input[placeholder*="Search"]')
  20 |     await searchInput.fill('Admin') // Assuming an admin exists
  21 |     await adminPage.waitForTimeout(1000)
  22 |     const rowText = await adminPage.locator('tbody').innerText()
  23 |     expect(rowText.toLowerCase()).toContain('admin')
  24 |   })
  25 | 
  26 |   // Full creation usually requires form filling, this is a smoke test version
  27 |   test('AGT-003 | New Member button opens creation modal/page', async ({ adminPage }) => {
> 28 |     await adminPage.goto(ROUTES.members)
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/members
  29 |     const newBtn = adminPage.locator('button:has-text("New Member"), a:has-text("New")')
  30 |     if (await newBtn.count() > 0) {
  31 |        await newBtn.first().click()
  32 |        // Wait for modal or form
  33 |        await expect(adminPage.locator('text=Add Member, text=Create Member, form')).toBeVisible({ timeout: 5000 })
  34 |     }
  35 |   })
  36 | 
  37 | })
  38 | 
```