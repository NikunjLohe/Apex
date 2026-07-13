# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-excel-import.spec.js >> Excel Import >> IMP-002 | Import History loads
- Location: tests\specs\09-excel-import.spec.js:19:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/import/history
Call log:
  - navigating to "http://localhost:5173/admin/import/history", waiting until "load"

```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/specs/09-excel-import.spec.js
  3  | // Import Center functionality
  4  | // =============================================================================
  5  | import { test, expect } from '../fixtures/auth.fixture.js'
  6  | import { ROUTES, IMPORT_EXCEL_FIXTURE } from '../fixtures/test-data.js'
  7  | import fs from 'fs'
  8  | 
  9  | test.describe('Excel Import', () => {
  10 | 
  11 |   test('IMP-001 | Admin can access Import Center', async ({ adminPage }) => {
  12 |     await adminPage.goto(ROUTES.importData)
  13 |     await expect(adminPage.locator('h1')).toHaveText(/Import/)
  14 |     await expect(adminPage.locator('input[type="file"]')).toBeVisible()
  15 |   })
  16 | 
  17 |   // We won't actually upload a file to avoid modifying the DB, 
  18 |   // but we test the UI readiness.
  19 |   test('IMP-002 | Import History loads', async ({ adminPage }) => {
> 20 |     await adminPage.goto(ROUTES.importHistory)
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/import/history
  21 |     await expect(adminPage.locator('h1')).toHaveText(/History/)
  22 |     // Table should not crash
  23 |     await expect(adminPage.locator('text=Something went wrong')).not.toBeVisible()
  24 |   })
  25 | 
  26 | })
  27 | 
```