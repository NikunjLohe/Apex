# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-excel-import.spec.js >> Excel Import >> IMP-001 | Admin can access Import Center
- Location: tests\specs\09-excel-import.spec.js:11:3

# Error details

```
Error: Error reading storage state from tests/.auth/admin.json:
ENOENT: no such file or directory, open 'C:\Users\User\OneDrive\Desktop\Apex\tests\.auth\admin.json'
```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/fixtures/auth.fixture.js
  3  | // Reusable Playwright fixture that injects an authenticated page context.
  4  | // =============================================================================
  5  | import { test as base } from '@playwright/test'
  6  | import { LoginPage } from '../pages/LoginPage.js'
  7  | import { CREDENTIALS } from './test-data.js'
  8  | 
  9  | /**
  10 |  * Extended test fixture with pre-authenticated page contexts.
  11 |  * Usage:
  12 |  *   import { test } from '../fixtures/auth.fixture.js'
  13 |  *   test('my test', async ({ superAdminPage }) => { ... })
  14 |  */
  15 | export const test = base.extend({
  16 |   // Super Admin authenticated page
  17 |   superAdminPage: async ({ browser }, use) => {
  18 |     const ctx = await browser.newContext({
  19 |       storageState: 'tests/.auth/superadmin.json',
  20 |     })
  21 |     const page = await ctx.newPage()
  22 |     await use(page)
  23 |     await ctx.close()
  24 |   },
  25 | 
  26 |   // Admin authenticated page (rank 14)
  27 |   adminPage: async ({ browser }, use) => {
> 28 |     const ctx = await browser.newContext({
     |                 ^ Error: Error reading storage state from tests/.auth/admin.json:
  29 |       storageState: 'tests/.auth/admin.json',
  30 |     })
  31 |     const page = await ctx.newPage()
  32 |     await use(page)
  33 |     await ctx.close()
  34 |   },
  35 | 
  36 |   // Branch Manager authenticated page (rank 10)
  37 |   managerPage: async ({ browser }, use) => {
  38 |     const ctx = await browser.newContext({
  39 |       storageState: 'tests/.auth/manager.json',
  40 |     })
  41 |     const page = await ctx.newPage()
  42 |     await use(page)
  43 |     await ctx.close()
  44 |   },
  45 | 
  46 |   // Field Agent authenticated page (rank 1)
  47 |   agentPage: async ({ browser }, use) => {
  48 |     const ctx = await browser.newContext({
  49 |       storageState: 'tests/.auth/agent.json',
  50 |     })
  51 |     const page = await ctx.newPage()
  52 |     await use(page)
  53 |     await ctx.close()
  54 |   },
  55 | 
  56 |   // Fresh unauthenticated page
  57 |   guestPage: async ({ browser }, use) => {
  58 |     const ctx = await browser.newContext()
  59 |     const page = await ctx.newPage()
  60 |     await use(page)
  61 |     await ctx.close()
  62 |   },
  63 | })
  64 | 
  65 | export { expect } from '@playwright/test'
  66 | 
```