# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 05-rank-management.spec.js >> Rank Management >> RNK-002 | Ranks table does not crash (StatusBadge fix validation)
- Location: tests\specs\05-rank-management.spec.js:21:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/settings
Call log:
  - navigating to "http://localhost:5173/admin/settings", waiting until "load"

```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/specs/05-rank-management.spec.js
  3  | // Rank Master in Settings
  4  | // =============================================================================
  5  | import { test, expect } from '../fixtures/auth.fixture.js'
  6  | import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'
  7  | 
  8  | test.describe('Rank Management', () => {
  9  | 
  10 |   test('RNK-001 | Super Admin can view Rank Master in Settings', async ({ superAdminPage }) => {
  11 |     await superAdminPage.goto(ROUTES.settings)
  12 |     
  13 |     // Click Rank Master tab
  14 |     await superAdminPage.locator('text=Rank Master, text=Ranks').click()
  15 |     
  16 |     // Ranks table should load
  17 |     await expect(superAdminPage.locator('table th:has-text("Rank Code")').first()).toBeVisible({ timeout: TIMEOUTS.table })
  18 |     await expect(superAdminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
  19 |   })
  20 | 
  21 |   test('RNK-002 | Ranks table does not crash (StatusBadge fix validation)', async ({ superAdminPage }) => {
> 22 |     await superAdminPage.goto(ROUTES.settings)
     |                          ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/settings
  23 |     await superAdminPage.locator('text=Rank Master, text=Ranks').click()
  24 |     // If it crashed, Error Boundary would show
  25 |     await expect(superAdminPage.locator('text=Something went wrong')).not.toBeVisible()
  26 |     await expect(superAdminPage.locator('tbody tr').first()).toBeVisible()
  27 |   })
  28 | 
  29 | })
  30 | 
```