# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 13-monthly-payout.spec.js >> Monthly Payout Engine >> PAY-001 | Admin can view Payout Engine page
- Location: tests\specs\13-monthly-payout.spec.js:10:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/payouts
Call log:
  - navigating to "http://localhost:5173/admin/payouts", waiting until "load"

```

# Test source

```ts
  1  | // =============================================================================
  2  | // tests/specs/13-monthly-payout.spec.js
  3  | // Payout Engine
  4  | // =============================================================================
  5  | import { test, expect } from '../fixtures/auth.fixture.js'
  6  | import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'
  7  | 
  8  | test.describe('Monthly Payout Engine', () => {
  9  | 
  10 |   test('PAY-001 | Admin can view Payout Engine page', async ({ adminPage }) => {
> 11 |     await adminPage.goto(ROUTES.payouts)
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/payouts
  12 |     await expect(adminPage.locator('h1')).toHaveText(/Payout Engine/)
  13 |     
  14 |     // Check for Generate button
  15 |     await expect(adminPage.locator('button:has-text("Generate")')).toBeVisible()
  16 |     
  17 |     // Wait for loading skeleton to disappear
  18 |     await adminPage.locator('.skeleton').first().waitFor({ state: 'hidden', timeout: TIMEOUTS.table }).catch(() => {})
  19 | 
  20 |     // Ensure table loads or empty state shows without crashing
  21 |     const tableVisible = await adminPage.locator('tbody tr').first().isVisible().catch(()=>false)
  22 |     const emptyVisible = await adminPage.locator('text=No Commission Bills').isVisible().catch(()=>false)
  23 |     expect(tableVisible || emptyVisible).toBeTruthy()
  24 |   })
  25 | 
  26 |   test('PAY-002 | Admin can view detailed payout statement with historical hierarchy', async ({ adminPage }) => {
  27 |     await adminPage.goto(ROUTES.payouts)
  28 |     await adminPage.locator('.skeleton').first().waitFor({ state: 'hidden', timeout: TIMEOUTS.table }).catch(() => {})
  29 | 
  30 |     // Click on the first payout detail link/row to view statement
  31 |     const firstRowLink = adminPage.locator('tbody tr td a, tbody tr').first()
  32 |     if (await firstRowLink.isVisible()) {
  33 |       await firstRowLink.click()
  34 |       
  35 |       // Verify page loads statement page
  36 |       await expect(adminPage.locator('h2')).toHaveText(/Payout Statement/i)
  37 |       
  38 |       // Verify Header details
  39 |       await expect(adminPage.locator('text=Apex Multisolutions Branch Operations Portal')).toBeVisible()
  40 |       await expect(adminPage.locator('text=Payout ID:')).toBeVisible()
  41 |       
  42 |       // Verify Agent Profile Snapshot is rendered
  43 |       await expect(adminPage.locator('text=Agent Profile Snapshot')).toBeVisible()
  44 |       await expect(adminPage.locator('text=PAN Number')).toBeVisible()
  45 |       await expect(adminPage.locator('text=Bank Name')).toBeVisible()
  46 |       
  47 |       // Verify Masked Bank details
  48 |       const accountField = adminPage.locator('text=Account Number')
  49 |       await expect(accountField).toBeVisible()
  50 |       
  51 |       // Verify Visual calculation flow
  52 |       await expect(adminPage.locator('text=Payment Calculation Flow')).toBeVisible()
  53 |       await expect(adminPage.locator('text=Gross Commission')).toBeVisible()
  54 |       await expect(adminPage.locator('text=Net Payable')).toBeVisible()
  55 | 
  56 |       // Verify expandable hierarchy
  57 |       const viewHierarchyButton = adminPage.locator('button:has-text("View Hierarchy")').first()
  58 |       if (await viewHierarchyButton.isVisible()) {
  59 |         // Toggle expand
  60 |         await viewHierarchyButton.click()
  61 |         // Verify genealogy path is now visible
  62 |         await expect(adminPage.locator('text=Genealogy Sponsor Path')).toBeVisible()
  63 |         // Verify some rank levels exist
  64 |         await expect(adminPage.locator('text=R1')).toBeVisible()
  65 |         await expect(adminPage.locator('text=R18')).toBeVisible()
  66 |       }
  67 | 
  68 |       // Verify commission allocation modal
  69 |       const viewAllocationButton = adminPage.locator('button:has-text("View Commission Allocation")').first()
  70 |       if (await viewAllocationButton.isVisible()) {
  71 |         await viewAllocationButton.click()
  72 |         // Verify Modal Title
  73 |         await expect(adminPage.locator('h3:has-text("Commission Allocation Audit")')).toBeVisible()
  74 |         // Verify Modal elements
  75 |         await expect(adminPage.locator('text=All Commission Recipients')).toBeVisible()
  76 |         await expect(adminPage.locator('text=Total Commission Distributed:')).toBeVisible()
  77 |         // Close modal
  78 |         await adminPage.click('button[aria-label="Close Modal"]')
  79 |         await expect(adminPage.locator('h3:has-text("Commission Allocation Audit")')).not.toBeVisible()
  80 |       }
  81 | 
  82 |       // Verify Audit Footer is visible at the bottom
  83 |       await expect(adminPage.locator('text=System Generated ID:')).toBeVisible()
  84 |       await expect(adminPage.locator('text=Payout Status:')).toBeVisible()
  85 |       await expect(adminPage.locator('text=Authorised Signature')).toBeVisible()
  86 |     }
  87 |   })
  88 | 
  89 | })
  90 | 
```