// =============================================================================
// tests/pages/LoginPage.js — Page Object Model
// =============================================================================
export class LoginPage {
  constructor(page) {
    this.page = page
    this.emailInput    = page.locator('input[name="email"]')
    this.passwordInput = page.locator('input[name="password"]')
    this.submitButton  = page.locator('button[type="submit"]')
    this.errorMessage  = page.locator('.text-danger, [role="alert"], .text-red')
  }

  async goto() {
    await this.page.goto('/login')
    await this.emailInput.waitFor({ timeout: 15_000 })
  }

  async login(email, password) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  async loginAndWaitForDashboard(email, password) {
    await this.login(email, password)
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })
  }

  async expectErrorVisible() {
    await this.errorMessage.waitFor({ timeout: 8_000 })
  }
}
