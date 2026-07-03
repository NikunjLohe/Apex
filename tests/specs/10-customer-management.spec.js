// =============================================================================
// tests/specs/10-customer-management.spec.js
// Customer CRUD operations
// =============================================================================
import { test, expect } from '../fixtures/auth.fixture.js'
import { CustomersPage, CustomerFormPage } from '../pages/CustomersPage.js'
import { TEST_CUSTOMER } from '../fixtures/test-data.js'

test.describe('Customer Management', () => {

  test('CUS-001 | View Customers list', async ({ adminPage }) => {
    const customersPage = new CustomersPage(adminPage)
    await customersPage.goto()
    // Should show table or empty state
    const tableVisible = await customersPage.tableRows.first().isVisible()
    const emptyVisible = await customersPage.emptyState.isVisible()
    expect(tableVisible || emptyVisible).toBeTruthy()
  })

  // We are creating a "QA Test" customer that we can use, but without submitting to DB 
  // to avoid side-effects.
  test('CUS-002 | New Customer form renders and validates', async ({ managerPage }) => {
    const customersPage = new CustomersPage(managerPage)
    await customersPage.goto()
    
    // Some roles might not have New Customer button, but Manager (Rank 10) should have it 
    // based on our capabilities.
    if (await customersPage.newButton.count() > 0) {
      await customersPage.clickNewCustomer()
      
      const form = new CustomerFormPage(managerPage)
      await form.submit() // Trigger validation
      
      // Should show validation errors for required fields
      await expect(form.errorMessages.first()).toBeVisible()
      
      // Fill form partially
      await form.fillPersonal(TEST_CUSTOMER)
      await expect(form.nameInput).toHaveValue(TEST_CUSTOMER.name)
    }
  })

})
