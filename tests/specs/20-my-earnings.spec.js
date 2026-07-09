import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'
import * as path from 'path'

test.describe('My Earnings (Agent Panel)', () => {

  test('EARN-001 | Manager can view own commissions and statement details with allocation audits', async ({ managerPage }) => {
    // 1. Navigate to My Earnings page
    await managerPage.goto(ROUTES.myEarnings)
    
    // Wait for skeleton or table to load
    await managerPage.locator('.skeleton').first().waitFor({ state: 'hidden', timeout: TIMEOUTS.table }).catch(() => {})

    // 2. Verify summary cards are present
    await expect(managerPage.locator('text="Lifetime Commission"')).toBeVisible()
    await expect(managerPage.locator('text="This Month"')).toBeVisible()
    await expect(managerPage.locator('text="Pending Commission"')).toBeVisible()
    await expect(managerPage.locator('text="Paid Commission"')).toBeVisible()

    // 3. Verify Personal Income Ledger has the mock policy row
    const tableRow = managerPage.locator('tbody tr:has-text("POL-MOCK-777")')
    await expect(tableRow).toBeVisible()

    // 4. Click "View Details"
    const viewDetailsBtn = tableRow.locator('button:has-text("View Details")')
    await expect(viewDetailsBtn).toBeVisible()
    await viewDetailsBtn.click()

    // 5. Verify the Modal loads correctly
    const modal = managerPage.locator('.modal-print-container')
    await expect(modal).toBeVisible()
    await expect(modal.locator('h3')).toHaveText(/Commission Detail Statement/i)

    // Wait for async allocation data to resolve
    await managerPage.locator('text=Fetching complete allocation details...').waitFor({ state: 'hidden', timeout: TIMEOUTS.modal }).catch(() => {})

    // 6. Verify basic details inside modal
    await expect(modal.locator('text=Policy Number')).toBeVisible()
    await expect(modal.locator('text=POL-MOCK-777').first()).toBeVisible()
    await expect(modal.locator('text=Alice Smith').first()).toBeVisible()
    await expect(modal.locator('text=Business Volume')).toBeVisible()
    await expect(modal.locator('text=Plan Code')).toBeVisible()
    await expect(modal.locator('text=Cycle Payout Details')).toBeVisible()

    // 7. Verify the "Why did I receive this commission?" explanation section
    await expect(modal.locator('text=Why did I receive this commission?')).toBeVisible()
    await expect(modal.locator('text=You are part of the sponsor hierarchy for this policy.')).toBeVisible()
    await expect(modal.locator('text=Your Rank')).toBeVisible()
    await expect(modal.locator('text=Configured %')).toBeVisible()
    await expect(modal.locator('text=Commission Earned').first()).toBeVisible()

    // 8. Verify COMPLETE sponsor hierarchy
    await expect(modal.locator('text=COMPLETE Sponsor Hierarchy Path')).toBeVisible()
    await expect(modal.locator('text="R1"').first()).toBeVisible()
    await expect(modal.locator('text="R10"').first()).toBeVisible()
    await expect(modal.locator('text="R18"').first()).toBeVisible()

    // 9. Verify COMPLETE commission allocation table
    await expect(modal.locator('text=COMPLETE Commission Allocation Ledger')).toBeVisible()
    await expect(modal.locator('text=Total Commission Distributed:')).toBeVisible()

    // 10. Verify Payment Details
    await expect(modal.locator('text=Cycle Payout Details')).toBeVisible()
    await expect(modal.locator('text=Gross Commission')).toBeVisible()
    await expect(modal.locator('text=TDS Deduction')).toBeVisible()
    await expect(modal.locator('text=Admin Charge')).toBeVisible()
    await expect(modal.locator('text=Net Commission')).toBeVisible()

    // 11. Verify Download and Print buttons
    const downloadBtn = modal.locator('button:has-text("Download Statement")')
    const printBtn = modal.locator('button:has-text("Print Statement")')
    await expect(downloadBtn).toBeVisible()
    await expect(printBtn).toBeVisible()

    // Test download functionality
    const [download] = await Promise.all([
      managerPage.waitForEvent('download'),
      downloadBtn.click()
    ])
    const filename = download.suggestedFilename()
    expect(filename).toContain('Commission_Statement_POL-MOCK-777.pdf')

    // Close modal
    await modal.locator('button:has-text("Close")').click()
    await expect(modal).not.toBeVisible()
  })

  test('EARN-002 | Security: Agent cannot see another agent\'s data', async ({ agentPage }) => {
    // Navigate to My Earnings page as Field Agent
    await agentPage.goto(ROUTES.myEarnings)
    await agentPage.locator('.skeleton').first().waitFor({ state: 'hidden', timeout: TIMEOUTS.table }).catch(() => {})

    // Verify mock ledger row POL-MOCK-777 (which belongs to QAMANAGER) is NOT visible to QAAGENT
    const tableRow = agentPage.locator('tbody tr:has-text("POL-MOCK-777")')
    await expect(tableRow).not.toBeVisible()
  })

})
