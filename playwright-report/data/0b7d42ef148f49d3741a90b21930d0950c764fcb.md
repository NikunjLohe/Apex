# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 08-genealogy-tree.spec.js >> Genealogy Tree >> GEN-001 | Agent can view their own Downline tree
- Location: tests\specs\08-genealogy-tree.spec.js:10:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/my-downline
Call log:
  - navigating to "http://localhost:5173/my-downline", waiting until "load"

```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/specs/08-genealogy-tree.spec.js
  3  | // Genealogy Tree Lazy Loading functionality
  4  | // =============================================================================
  5  | import { test, expect } from '../fixtures/auth.fixture.js'
  6  | import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'
  7  | 
  8  | test.describe('Genealogy Tree', () => {
  9  | 
  10 |   test('GEN-001 | Agent can view their own Downline tree', async ({ agentPage }) => {
> 11 |     await agentPage.goto(ROUTES.myDownline)
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/my-downline
  12 |     
  13 |     // Check if the tree renders
  14 |     await expect(agentPage.locator('.react-transform-wrapper, text=Zoom In').first()).toBeVisible({ timeout: TIMEOUTS.table })
  15 |     
  16 |     // Check if at least the root node (themselves) is rendered
  17 |     await expect(agentPage.locator('text=Rank').first()).toBeVisible()
  18 |   })
  19 | 
  20 |   test('GEN-002 | Search works in Downline tree', async ({ agentPage }) => {
  21 |     await agentPage.goto(ROUTES.myDownline)
  22 |     
  23 |     const searchInput = agentPage.locator('input[placeholder*="Search"]')
  24 |     if (await searchInput.count() > 0) {
  25 |       await searchInput.fill('Agent')
  26 |       await agentPage.waitForTimeout(1000)
  27 |       // The tree should highlight or filter, no crash should occur
  28 |       await expect(agentPage.locator('text=Something went wrong')).not.toBeVisible()
  29 |     }
  30 |   })
  31 | 
  32 | })
  33 | 
```