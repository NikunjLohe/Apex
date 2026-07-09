// =============================================================================
// tests/specs/13-monthly-payout.spec.js
// Payout Engine
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Monthly Payout Engine', () => {

  test('PAY-001 | Admin can view Payout Engine page', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.payouts)
    await expect(adminPage.locator('h1')).toHaveText(/Payout Engine/)
    
    // Check for Generate button
    await expect(adminPage.locator('button:has-text("Generate")')).toBeVisible()
    
    // Wait for loading skeleton to disappear
    await adminPage.locator('.skeleton').first().waitFor({ state: 'hidden', timeout: TIMEOUTS.table }).catch(() => {})

    // Ensure table loads or empty state shows without crashing
    const tableVisible = await adminPage.locator('tbody tr').first().isVisible().catch(()=>false)
    const emptyVisible = await adminPage.locator('text=No payouts').isVisible().catch(()=>false)
    expect(tableVisible || emptyVisible).toBeTruthy()
  })

  test('PAY-002 | Admin can view detailed payout statement with historical hierarchy', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.payouts)
    await adminPage.locator('.skeleton').first().waitFor({ state: 'hidden', timeout: TIMEOUTS.table }).catch(() => {})

    // Click on the first payout detail link/row to view statement
    const firstRowLink = adminPage.locator('tbody tr td a, tbody tr').first()
    if (await firstRowLink.isVisible()) {
      await firstRowLink.click()
      
      // Verify page loads statement page
      await expect(adminPage.locator('h2')).toHaveText(/Payout Statement/i)
      
      // Verify Header details
      await expect(adminPage.locator('text=APEX Branch Operations Portal')).toBeVisible()
      await expect(adminPage.locator('text=Payout ID:')).toBeVisible()
      
      // Verify Agent Profile Snapshot is rendered
      await expect(adminPage.locator('text=Agent Profile Snapshot')).toBeVisible()
      await expect(adminPage.locator('text=PAN Number')).toBeVisible()
      await expect(adminPage.locator('text=Bank Name')).toBeVisible()
      
      // Verify Masked Bank details
      const accountField = adminPage.locator('text=Account Number')
      await expect(accountField).toBeVisible()
      
      // Verify Visual calculation flow
      await expect(adminPage.locator('text=Payment Calculation Flow')).toBeVisible()
      await expect(adminPage.locator('text=Gross Commission')).toBeVisible()
      await expect(adminPage.locator('text=Net Payable')).toBeVisible()

      // Verify expandable hierarchy
      const viewHierarchyButton = adminPage.locator('button:has-text("View Hierarchy")').first()
      if (await viewHierarchyButton.isVisible()) {
        // Toggle expand
        await viewHierarchyButton.click()
        // Verify genealogy path is now visible
        await expect(adminPage.locator('text=Genealogy Sponsor Path')).toBeVisible()
        // Verify some rank levels exist
        await expect(adminPage.locator('text=R1')).toBeVisible()
        await expect(adminPage.locator('text=R18')).toBeVisible()
      }

      // Verify commission allocation modal
      const viewAllocationButton = adminPage.locator('button:has-text("View Commission Allocation")').first()
      if (await viewAllocationButton.isVisible()) {
        await viewAllocationButton.click()
        // Verify Modal Title
        await expect(adminPage.locator('h3:has-text("Commission Allocation Audit")')).toBeVisible()
        // Verify Modal elements
        await expect(adminPage.locator('text=All Commission Recipients')).toBeVisible()
        await expect(adminPage.locator('text=Total Commission Distributed:')).toBeVisible()
        // Close modal
        await adminPage.click('button[aria-label="Close Modal"]')
        await expect(adminPage.locator('h3:has-text("Commission Allocation Audit")')).not.toBeVisible()
      }

      // Verify Audit Footer is visible at the bottom
      await expect(adminPage.locator('text=System Generated ID:')).toBeVisible()
      await expect(adminPage.locator('text=Payout Status:')).toBeVisible()
      await expect(adminPage.locator('text=Authorised Signature')).toBeVisible()
    }
  })

})
