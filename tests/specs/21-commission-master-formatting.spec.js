// =============================================================================
// tests/specs/21-commission-master-formatting.spec.js
// Commission Master: Verify all percentage inputs display exactly 2 decimal places
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, TIMEOUTS } from '../fixtures/test-data.js'

test.describe('Commission Master Formatting', () => {

  test('CM-FMT-001 | All commission percentage inputs display exactly 2 decimal places', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.settings)

    // Click Commission Master tab — also acts as implicit page-ready wait
    const commTab = adminPage.getByRole('button', { name: /commission master/i })
    await commTab.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation })
    await commTab.click()

    // Select first available plan from dropdown
    const planSelect = adminPage.locator('select').first()
    await planSelect.waitFor({ state: 'visible', timeout: TIMEOUTS.table })
    const options = await planSelect.locator('option').all()
    if (options.length > 1) {
      await planSelect.selectOption({ index: 1 })
      await adminPage.waitForTimeout(800)
    }

    // Wait for commission table rows to appear
    await adminPage.waitForSelector('table tbody tr', { timeout: TIMEOUTS.table })

    // Collect all text inputs in the commission table
    const inputs = adminPage.locator('table tbody tr td input[type="text"]')
    const count = await inputs.count()
    console.log(`Found ${count} commission inputs`)
    expect(count).toBeGreaterThan(0)

    const twoDecimalRegex = /^\d+\.\d{2}$/

    for (let i = 0; i < count; i++) {
      const val = await inputs.nth(i).inputValue()
      console.log(`Row ${i + 1}: "${val}"`)
      // Every value must match exactly 2 decimal places
      expect(
        val,
        `Row ${i + 1} value "${val}" should have exactly 2 decimal places (e.g. "0.00" not "0" or "0.4")`
      ).toMatch(twoDecimalRegex)
    }

    // Screenshot for evidence
    await adminPage.screenshot({ path: 'tests/screenshots/commission-master-formatting.png' })
  })

  test('CM-FMT-002 | Saved value with trailing zero is preserved as 2 decimals after reload', async ({ superAdminPage }) => {
    await superAdminPage.goto(ROUTES.settings)

    // Click Commission Master tab
    const commTab = superAdminPage.getByRole('button', { name: /commission master/i })
    await commTab.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation })
    await commTab.click()

    // Select first available plan
    const planSelect = superAdminPage.locator('select').first()
    await planSelect.waitFor({ state: 'visible', timeout: TIMEOUTS.table })
    const options = await planSelect.locator('option').all()
    if (options.length > 1) {
      await planSelect.selectOption({ index: 1 })
      await superAdminPage.waitForTimeout(800)
    }

    await superAdminPage.waitForSelector('table tbody tr', { timeout: TIMEOUTS.table })

    // Click first input, clear and type a value with trailing zero
    const firstInput = superAdminPage.locator('table tbody tr td input[type="text"]').first()
    await firstInput.click()
    await firstInput.fill('3.40')
    await firstInput.press('Tab') // trigger blur / commit

    // Save the matrix
    const saveBtn = superAdminPage.getByRole('button', { name: /save matrix/i })
    await saveBtn.waitFor({ state: 'visible', timeout: TIMEOUTS.modal })
    await saveBtn.click()

    // Wait for success toast
    await superAdminPage.waitForSelector('[class*="toast"], [role="status"]', { timeout: TIMEOUTS.toast }).catch(() => {})
    await superAdminPage.waitForTimeout(1500)

    // Reload and re-navigate to Commission Master
    await superAdminPage.goto(ROUTES.settings)
    const commTab2 = superAdminPage.getByRole('button', { name: /commission master/i })
    await commTab2.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation })
    await commTab2.click()

    // Re-select same plan
    await planSelect.waitFor({ state: 'visible', timeout: TIMEOUTS.table })
    if (options.length > 1) {
      await planSelect.selectOption({ index: 1 })
      await superAdminPage.waitForTimeout(800)
    }

    await superAdminPage.waitForSelector('table tbody tr', { timeout: TIMEOUTS.table })

    // Verify first input shows exactly '3.40', not '3.4'
    const firstInputAfter = superAdminPage.locator('table tbody tr td input[type="text"]').first()
    const savedVal = await firstInputAfter.inputValue()
    console.log(`After save+reload, first input = "${savedVal}"`)
    expect(savedVal).toBe('3.40')

    // Screenshot final state
    await superAdminPage.screenshot({ path: 'tests/screenshots/commission-master-after-save.png' })
  })

})
