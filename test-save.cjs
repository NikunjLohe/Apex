const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  page.on('requestfailed', request => console.log('NETWORK FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'admin@apex.com');
  await page.fill('input[type="password"]', 'Apex@12345');
  await page.click('button[type="submit"]');
  
  await page.waitForURL('http://localhost:5173/dashboard');
  
  await page.goto('http://localhost:5173/customers/new');
  
  await page.fill('input[name="name"]', 'Test Customer');
  await page.fill('input[name="phone"]', '9999999999');
  await page.fill('input[name="city"]', 'Test City');
  await page.fill('input[name="state"]', 'Test State');
  await page.fill('input[name="pincode"]', '123456');
  await page.fill('input[name="aadhaar"]', '123456789012');
  await page.fill('input[name="pan"]', 'ABCDE1234F');
  
  await page.fill('input[name="nomineeName"]', 'Test Nominee');
  await page.fill('input[name="nomineeRelation"]', 'Father');
  
  // Click save
  await page.click('button:has-text("Create Customer")');
  
  console.log('Clicked save. Waiting 5 seconds to see what happens...');
  await page.waitForTimeout(5000);
  
  await browser.close();
})();
