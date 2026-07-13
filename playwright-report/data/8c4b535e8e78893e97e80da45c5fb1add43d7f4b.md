# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-branch-management.spec.js >> Branch Management >> BRN-002 | Search branches
- Location: tests\specs\04-branch-management.spec.js:16:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/branches
Call log:
  - navigating to "http://localhost:5173/admin/branches", waiting until "load"

```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/specs/04-branch-management.spec.js
  3  | // Branch creation, listing, and editing
  4  | // =============================================================================
  5  | import { test, expect } from '../fixtures/auth.fixture.js'
  6  | import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'
  7  | 
  8  | test.describe('Branch Management', () => {
  9  | 
  10 |   test('BRN-001 | Admin can view Branches list', async ({ adminPage }) => {
  11 |     await adminPage.goto(ROUTES.branches)
  12 |     await expect(adminPage.locator('h1')).toHaveText(/Branches/)
  13 |     await expect(adminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
  14 |   })
  15 | 
  16 |   test('BRN-002 | Search branches', async ({ adminPage }) => {
> 17 |     await adminPage.goto(ROUTES.branches)
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/branches
  18 |     const searchInput = adminPage.locator('input[placeholder*="Search"]')
  19 |     await searchInput.fill('HQ') // Assuming HQ exists
  20 |     await adminPage.waitForTimeout(1000)
  21 |     const rowText = await adminPage.locator('tbody').innerText()
  22 |     // It should filter, or say no records if HQ doesn't exist
  23 |     expect(rowText).toBeTruthy()
  24 |   })
  25 | 
  26 | })
  27 | 
```