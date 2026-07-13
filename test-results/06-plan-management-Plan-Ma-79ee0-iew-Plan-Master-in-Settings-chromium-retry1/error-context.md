# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 06-plan-management.spec.js >> Plan Management >> PLN-001 | Admin can view Plan Master in Settings
- Location: tests\specs\06-plan-management.spec.js:10:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/settings
Call log:
  - navigating to "http://localhost:5173/admin/settings", waiting until "load"

```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/specs/06-plan-management.spec.js
  3  | // Plan Master in Settings
  4  | // =============================================================================
  5  | import { test, expect } from '../fixtures/auth.fixture.js'
  6  | import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'
  7  | 
  8  | test.describe('Plan Management', () => {
  9  | 
  10 |   test('PLN-001 | Admin can view Plan Master in Settings', async ({ adminPage }) => {
> 11 |     await adminPage.goto(ROUTES.settings)
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/settings
  12 |     
  13 |     await adminPage.locator('text=Plan Master, text=Plans').click()
  14 |     
  15 |     // Plans table should load without crashing (StatusBadge fix validation)
  16 |     await expect(adminPage.locator('table th:has-text("Plan Code")').first()).toBeVisible({ timeout: TIMEOUTS.table })
  17 |     await expect(adminPage.locator('text=Something went wrong')).not.toBeVisible()
  18 |     await expect(adminPage.locator('tbody tr').first()).toBeVisible({ timeout: TIMEOUTS.table })
  19 |   })
  20 | 
  21 | })
  22 | 
```