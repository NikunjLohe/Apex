import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES } from '../fixtures/test-data.js'
import path from 'path'

test.describe('Excel Import E2E Client Format', () => {

  test('Upload Client Excel format should be mapped correctly without errors', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.importData)
    await expect(adminPage.locator('h1')).toHaveText(/Import/)
    
    // Upload client-format.xlsx
    const filePath = path.resolve('client-format.xlsx')
    await adminPage.setInputFiles('input[type="file"]', filePath)

    // Check for "Column mismatch" toast (should NOT be visible)
    await expect(adminPage.locator('text=Column mismatch')).not.toBeVisible()
    
    // Verify bindings table reflects the CLIENT columns
    const bindingsSection = adminPage.locator('text=Excel Header Column Bindings').locator('..')
    await expect(bindingsSection.locator('text=CUSTOMER ID')).toBeVisible()
    await expect(bindingsSection.locator('text=CUSTOMER NAME')).toBeVisible()
    await expect(bindingsSection.locator('text=MOBILE NUMBER')).toBeVisible()
    await expect(bindingsSection.locator('text=MONTHLY AMT')).toBeVisible()
    await expect(bindingsSection.locator('text=TOTAL AMT')).toBeVisible()
    await expect(bindingsSection.locator('text=START DATE')).toBeVisible()
    
    // Verify preview table has extracted the values mapped properly
    // Client file row 1 has CIF ID 20902, Name BARVE DINESH, agent KB000011, plan RD1Y
    await expect(adminPage.locator('td', { hasText: '20902' })).toBeVisible()
    await expect(adminPage.locator('td', { hasText: 'BARVE DINESH' })).toBeVisible()
    await expect(adminPage.locator('td', { hasText: 'RD1Y' })).toBeVisible()
  })

  test('Upload Testing Excel format should be mapped correctly without errors', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.importData)
    await expect(adminPage.locator('h1')).toHaveText(/Import/)
    
    // Upload testing-format.xlsx
    const filePath = path.resolve('testing-format.xlsx')
    await adminPage.setInputFiles('input[type="file"]', filePath)

    // Check for "Column mismatch" toast (should NOT be visible)
    await expect(adminPage.locator('text=Column mismatch')).not.toBeVisible()
    
    // Verify bindings table reflects the TESTING columns
    const bindingsSection = adminPage.locator('text=Excel Header Column Bindings').locator('..')
    await expect(bindingsSection.locator('text=Customer ID').first()).toBeVisible()
    await expect(bindingsSection.locator('text=Monthly Amount').first()).toBeVisible()
    
    // Verify preview table has extracted the values
    // Testing file has CIF2008, Rajesh Sharma, RD1Y
    await expect(adminPage.locator('td', { hasText: 'CIF2008' })).toBeVisible()
    await expect(adminPage.locator('td', { hasText: 'Rajesh Sharma' })).toBeVisible()
    await expect(adminPage.locator('td', { hasText: 'RD1Y' })).toBeVisible()
  })

})
