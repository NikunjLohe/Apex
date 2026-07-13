# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 07-sponsor-id.spec.js >> Sponsor ID >> SPO-002 | Admin can view Sponsor IDs in Members list
- Location: tests\specs\07-sponsor-id.spec.js:18:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/members
Call log:
  - navigating to "http://localhost:5173/admin/members", waiting until "load"

```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/specs/07-sponsor-id.spec.js
  3  | // Verifying Sponsor Code generation and linkage
  4  | // =============================================================================
  5  | import { test, expect } from '../fixtures/auth.fixture.js'
  6  | import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'
  7  | 
  8  | test.describe('Sponsor ID', () => {
  9  | 
  10 |   test('SPO-001 | Agent sees their own Sponsor ID in profile or dashboard', async ({ agentPage }) => {
  11 |     await agentPage.goto(ROUTES.dashboard)
  12 |     // Most dashboards show the agent code somewhere, or in the navbar
  13 |     const bodyText = await agentPage.locator('body').innerText()
  14 |     // It should exist in the body or header
  15 |     expect(bodyText).toMatch(/AG\d{6}/i) 
  16 |   })
  17 | 
  18 |   test('SPO-002 | Admin can view Sponsor IDs in Members list', async ({ adminPage }) => {
> 19 |     await adminPage.goto(ROUTES.members)
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/members
  20 |     await expect(adminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
  21 |     const rowText = await adminPage.locator('tbody').innerText()
  22 |     // There should be at least one AG format ID visible
  23 |     expect(rowText).toMatch(/AG\d{6}/i)
  24 |   })
  25 | 
  26 | })
  27 | 
```