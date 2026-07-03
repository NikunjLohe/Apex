// =============================================================================
// tests/pages/CustomersPage.js — Page Object Model
// =============================================================================
export class CustomersPage {
  constructor(page) {
    this.page        = page
    this.searchInput = page.locator('input[placeholder*="Search" i], input[placeholder*="search" i]').first()
    this.tableRows   = page.locator('tbody tr')
    this.newButton   = page.locator('a[href*="/customers/new"], button:has-text("New Customer"), a:has-text("New")')
    this.emptyState  = page.locator('text=No customers, text=No records, text=no customer').first()
  }

  async goto() {
    await this.page.goto('/customers')
    await this.page.waitForLoadState('networkidle')
  }

  async search(term) {
    await this.searchInput.fill(term)
    await this.page.waitForTimeout(600) // debounce
  }

  async clickNewCustomer() {
    await this.newButton.click()
    await this.page.waitForURL('**/customers/new')
  }

  async openFirstRow() {
    await this.tableRows.first().click()
    await this.page.waitForLoadState('networkidle')
  }
}

// =============================================================================
// tests/pages/CustomerFormPage.js — Page Object Model
// =============================================================================
export class CustomerFormPage {
  constructor(page) {
    this.page = page
    // Personal
    this.nameInput     = page.locator('input[name="name"]')
    this.dobInput      = page.locator('input[name="dob"]')
    this.phoneInput    = page.locator('input[name="phone"]')
    this.genderSelect  = page.locator('select[name="gender"]')
    this.emailInput    = page.locator('input[name="email"]')
    // Address
    this.address1Input = page.locator('input[name="address1"]')
    this.cityInput     = page.locator('input[name="city"]')
    this.stateInput    = page.locator('input[name="state"]')
    this.pincodeInput  = page.locator('input[name="pincode"]')
    // IDs
    this.aadhaarInput  = page.locator('input[name="aadhaar"]')
    this.panInput      = page.locator('input[name="pan"]')
    // Nominee
    this.nomineeNameInput     = page.locator('input[name="nomineeName"]')
    this.nomineeRelationInput = page.locator('input[name="nomineeRelation"]')
    this.nomineePhoneInput    = page.locator('input[name="nomineePhone"]')
    // Submit
    this.submitButton  = page.locator('button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Create")')
    this.errorMessages = page.locator('.text-danger, .text-red-500, [role="alert"]')
  }

  async fillPersonal(data) {
    await this.nameInput.fill(data.name)
    await this.dobInput.fill(data.dob)
    await this.phoneInput.fill(data.phone)
    if (data.gender) await this.genderSelect.selectOption(data.gender)
    if (data.email) await this.emailInput.fill(data.email)
  }

  async fillAddress(data) {
    await this.address1Input.fill(data.address1)
    await this.cityInput.fill(data.city)
    await this.stateInput.fill(data.state)
    await this.pincodeInput.fill(data.pincode)
  }

  async fillIds(data) {
    await this.aadhaarInput.fill(data.aadhaar)
    await this.panInput.fill(data.pan)
  }

  async fillNominee(data) {
    await this.nomineeNameInput.fill(data.nomineeName)
    await this.nomineeRelationInput.fill(data.nomineeRelation)
    await this.nomineePhoneInput.fill(data.nomineePhone)
  }

  async submit() {
    await this.submitButton.click()
  }
}
