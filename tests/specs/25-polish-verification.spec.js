import { test, expect } from '../fixtures/auth.fixture.js'
import { ROUTES } from '../fixtures/test-data.js'

test.describe('Handover Verification Spec', () => {
  test('Verify Add Member standardizations, prefix settings, duplicate blocks, and rank restrictions', async ({ adminPage }) => {
    // 1. Visit Settings to set prefix and email domain
    await adminPage.goto(ROUTES.settings)
    await adminPage.waitForSelector('text=Company Credentials Settings')

    // Set Prefix and Domain
    const prefixInput = adminPage.locator('input:near(label:has-text("New Agent Code Prefix"))').first()
    await prefixInput.fill('KB')

    const domainInput = adminPage.locator('input:near(label:has-text("Auto-Generated Email Domain"))').first()
    await domainInput.fill('apex.local')

    await adminPage.click('button:has-text("Save Settings")')
    await adminPage.waitForSelector('text=System Settings saved')
    console.log('1. Settings prefix and domain configured successfully!')

    // 2. Go to Members
    await adminPage.goto(ROUTES.members)
    await adminPage.waitForSelector('table.tbl')
    await adminPage.click('button:has-text("Add Member")')
    await adminPage.waitForSelector('text=Add member')

    // Generate a unique PAN for the email duplication check
    const emailTestPan = `PANEM${Math.floor(1000 + Math.random() * 9000)}Y`

    // Fill duplicate email to trigger check
    // We use a unique PAN so PAN verification passes and we check email
    await adminPage.fill('input[name="name"]', 'Handover Agent')
    await adminPage.fill('input[name="phone"]', '9812345678')
    await adminPage.fill('input[name="panNumber"]', emailTestPan)
    
    // Fill existing email (superadmin@apex.test)
    const emailField = adminPage.locator('input[name="email"]')
    await emailField.fill('superadmin@apex.test')

    console.log('Testing duplicate email validation...')
    await adminPage.click('button:has-text("Create")')
    
    // Check if there are form validation errors instead of toast
    const errCount = await adminPage.locator('.err').count()
    if (errCount > 0) {
      for (let i = 0; i < errCount; i++) {
        console.log('Form Error:', await adminPage.locator('.err').nth(i).innerText())
      }
    }

    const emailToast = adminPage.locator('[role="status"]:has-text("Email")').first()
    await expect(emailToast).toBeVisible({ timeout: 15000 })
    console.log('Toast Text 1:', await emailToast.innerText())
    console.log('PASS: Duplicate Email address successfully blocked by validation!')

    // Generate a unique PAN for the phone duplication check
    const phoneTestPan = `PANPH${Math.floor(1000 + Math.random() * 9000)}Z`

    // Fill unique email but duplicate phone (we'll use QA Test Agent phone '9999999003' from seed data)
    await emailField.fill('')
    await adminPage.fill('input[name="phone"]', '9999999003')
    await adminPage.fill('input[name="panNumber"]', phoneTestPan)
    
    await adminPage.click('button:has-text("Create")')
    const phoneToast = adminPage.locator('[role="status"]:has-text("Phone")').first()
    await expect(phoneToast).toBeVisible({ timeout: 15000 })
    console.log('Toast Text 2:', await phoneToast.innerText())
    console.log('PASS: Duplicate Phone number successfully blocked by validation!')

    // Close and open modal to refresh state
    await adminPage.click('button:has-text("Cancel")')
    await adminPage.click('button:has-text("Add Member")')
    await adminPage.waitForSelector('text=Add member')

    // Fill a unique agent details, leaving Email blank to test auto-generation
    const uniquePhone = '98' + Math.floor(10000000 + Math.random() * 90000000)
    const uniquePan = `PANOK${Math.floor(1000 + Math.random() * 9000)}K`
    await adminPage.fill('input[name="name"]', 'Handover Test Agent')
    await adminPage.fill('input[name="phone"]', uniquePhone)
    await adminPage.fill('input[name="panNumber"]', uniquePan)
    
    await adminPage.click('button:has-text("Create")')

    // Wait for the credentials welcome popup
    await adminPage.waitForSelector('text=Agent Onboarded Successfully', { timeout: 20000 })
    console.log('Agent onboarded successfully!')

    // Read generated values
    const modalText = await adminPage.locator('.bg-navy-2.rounded-card').innerText()
    console.log('Modal text details:', modalText)
    
    expect(modalText).toContain('KB00')
    expect(modalText).toContain('@apex.local')
    console.log('PASS: Agent Code sequencing (KB) and email domain generation (@apex.local) are working perfectly!')

    // Click Copy Credentials to close
    await adminPage.click('button:has-text("Copy Credentials")')
    await adminPage.waitForSelector('text=Credentials copied to clipboard')
  })

  test('Verify Sidebar cleanup (Defaulters & Maturities hidden for Agents) and Rank 1 recruitment disabled', async ({ agentPage }) => {
    agentPage.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`PAGE ERROR: "${msg.text()}"`);
      }
    });
    agentPage.on('pageerror', err => {
      console.log(`PAGE EXCEPTION: "${err.message}"\nStack:\n${err.stack}`);
    });

    // 1. Verify Agent Sidebar links
    await agentPage.goto(ROUTES.dashboard)
    
    // Defaulters and Maturities links should NOT be present in Agent sidebar
    const sidebarText = await agentPage.locator('aside').innerText()
    expect(sidebarText).not.toContain('Defaulters')
    expect(sidebarText).not.toContain('Maturities')
    console.log('PASS: Defaulters and Maturities links successfully hidden from Agent sidebar!')

    // 2. Verify Add Member quick action button is hidden on Dashboard
    const dashboardText = await agentPage.locator('main').innerText()
    expect(dashboardText).not.toContain('Add Member')
    console.log('PASS: Add Member quick action link successfully hidden from Dashboard for Rank 1 agent!')

    // 3. Verify Recruit Agent button is hidden in My Downline
    await agentPage.goto(ROUTES.myDownline)
    await agentPage.waitForSelector('text=Team Downline')
    
    const pageContent = await agentPage.locator('main').innerText()
    expect(pageContent).not.toContain('Recruit Agent')
    console.log('PASS: Recruit Agent button successfully hidden in My Downline page for Rank 1 agent!')
  })
})
