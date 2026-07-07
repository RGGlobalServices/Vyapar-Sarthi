import { test, expect } from '@playwright/test';

// Use Vyapar package for billing tests
const TEST_USER = { email: 'rahul.gosavi8420@gmail.com', password: 'Rahul@123' };

test.describe('Billing & POS Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/en/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('a:has-text("EN")').first()).toBeVisible({ timeout: 15000 });
  });

  test('Navigate to Billing and Check Elements', async ({ page }) => {
    // Navigate to billing
    const billingLink = page.locator('a[href$="/billing"]');
    await expect(billingLink).toBeVisible();
    await billingLink.click();
    
    // Check if Billing interface loaded correctly
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    const manualAddBtn = page.locator('button', { hasText: /(Manual Add|मॅन्युअल ॲड)/i });
    await expect(manualAddBtn).toBeVisible();

    const qrScanBtn = page.locator('button', { hasText: /(QR)/i });
    await expect(qrScanBtn).toBeVisible();
  });

  test('Check Payment Modes', async ({ page }) => {
    await page.locator('a[href$="/billing"]').click();
    
    // Verify Payment Modes exist
    await expect(page.locator('button', { hasText: /(Cash|रोख)/i }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'UPI' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /(Udhar|उधार)/i }).first()).toBeVisible();
  });
});
