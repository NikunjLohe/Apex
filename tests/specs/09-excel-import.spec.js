// =============================================================================
// tests/specs/09-excel-import.spec.js
// Import Center functionality
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES, IMPORT_EXCEL_FIXTURE } from '../fixtures/test-data.js'
import fs from 'fs'

test.describe('Excel Import', () => {

  test('IMP-001 | Admin can access Import Center', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.importData)
    await expect(adminPage.locator('h1')).toHaveText(/Import/)
    await expect(adminPage.locator('input[type="file"]')).toBeVisible()
  })

  // We won't actually upload a file to avoid modifying the DB, 
  // but we test the UI readiness.
  test('IMP-002 | Import History loads', async ({ adminPage }) => {
    await adminPage.goto(ROUTES.importHistory)
    await expect(adminPage.locator('h1')).toHaveText(/History/)
    // Table should not crash
    await expect(adminPage.locator('text=Something went wrong')).not.toBeVisible()
  })

})
