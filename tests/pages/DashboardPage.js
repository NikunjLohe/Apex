// =============================================================================
// tests/pages/DashboardPage.js — Page Object Model
// =============================================================================
export class DashboardPage {
  constructor(page) {
    this.page          = page
    this.heading       = page.locator('h2, h1').first()
    this.sidebar       = page.locator('nav')
    this.kpiCards      = page.locator('.card')
    this.errorBoundary = page.locator('text=Something went wrong')
    this.loader        = page.locator('.animate-pulse')
    this.globalSearch  = page.locator('input[placeholder*="search" i], input[placeholder*="Global" i]')
  }

  async goto() {
    await this.page.goto('/dashboard')
    await this.heading.waitFor({ timeout: 15_000 })
  }

  async waitForContentLoaded() {
    await this.loader.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
    await this.errorBoundary.waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
  }

  async expectNoError() {
    await this.errorBoundary.waitFor({ state: 'detached', timeout: 8_000 })
  }

  sidebarLink(label) {
    return this.page.locator(`nav a:has-text("${label}")`)
  }

  async expectSidebarContains(label) {
    await this.sidebarLink(label).waitFor({ timeout: 5_000 })
  }

  async expectSidebarNotContains(label) {
    await this.sidebarLink(label).waitFor({ state: 'detached', timeout: 5_000 })
  }
}
