import { test, expect } from '@playwright/test';

const TEST_USER = { email: 'rahul.gosavi8420@gmail.com', password: 'Rahul@123' };

test.describe('Sidebar & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('a:has-text("EN")').first()).toBeVisible({ timeout: 15000 });
  });

  test('Navigate to all primary Sidebar Links', async ({ page }) => {
    // Array of all main navigation items expected in the sidebar
    const sidebarLinks = [
      { name: 'Dashboard', path: '/dashboard' },
      { name: 'Billing', path: '/billing' },
      { name: 'Products', path: '/products' },
      { name: 'Stock', path: '/stock' },
      { name: 'Suppliers', path: '/suppliers' },
      { name: 'Customers', path: '/customers' },
      { name: 'Analytics', path: '/analytics' },
      { name: 'Calendar', path: '/calendar' },
      { name: 'Ledger', path: '/ledger' },
      { name: 'Settings', path: '/settings' }
    ];

    for (const link of sidebarLinks) {
      // Find the anchor tag ending with the specific path
      const navLink = page.locator(`a[href$="${link.path}"]`).first();
      // Only click if it's visible (some links might be hidden based on roles/plans)
      if (await navLink.isVisible()) {
        await navLink.click();
        await expect(page).toHaveURL(new RegExp(`.*${link.path}.*`));
      }
    }
  });

  test('Shop Selector Dropdown Functions', async ({ page }) => {
    // Look for the shop selector button (usually contains the shop icon/name)
    const shopSelector = page.locator('button').filter({ has: page.locator('text="Main Store"').or(page.locator('text="Main Warehouse"')) }).first();
    if (await shopSelector.isVisible()) {
      await shopSelector.click();
      
      // Verify dropdown options load (Add New Shop button)
      const addShopBtn = page.locator('button:has-text("Add New Shop")');
      await expect(addShopBtn).toBeVisible();
      
      // Click Add New Shop and verify modal
      await addShopBtn.click();
      await expect(page.locator('text=Business Name')).toBeVisible(); // modal text
    }
  });

  test('Check Theme and Language Toggles', async ({ page }) => {
    // Theme Switcher - Verify existence
    const themeText = page.locator('text=Theme').or(page.locator('text=थीम')).first();
    await expect(themeText).toBeVisible();
    
    // Language toggles
    await expect(page.locator('a:has-text("EN")').first()).toBeVisible();
    await expect(page.locator('a:has-text("MR")').first()).toBeVisible();
    await expect(page.locator('a:has-text("HI")').first()).toBeVisible();
    
    // Click 'MR' and wait for language change in URL
    await page.locator('a:has-text("MR")').first().click();
    await expect(page).toHaveURL(/.*\/mr\/.*/);
  });

  test('Access Role Switcher Modal', async ({ page }) => {
    // Verify Role text
    const roleText = page.locator('text=Access Role').or(page.locator('text=अ‍ॅक्सेस रोल')).first();
    await expect(roleText).toBeVisible();

    // Click the Admin button to trigger pin modal (if currently Admin, it switches to Staff, if Staff, prompts PIN)
    const roleBtn = page.locator('button', { hasText: /(ADMIN|STAFF|अ‍ॅडमिन|स्टाफ)/i }).first();
    if (await roleBtn.isVisible()) {
      await roleBtn.click();
      // The modal or state change should happen
      // If it prompted for PIN:
      const pinInput = page.locator('input[type="password"]');
      if (await pinInput.count() > 0) {
        await expect(pinInput).toBeVisible();
      }
    }
  });

  test('Logout Button', async ({ page }) => {
    // Click logout
    const logoutBtn = page.locator('button:has-text("Logout")').or(page.locator('button:has-text("लॉगआउट")')).first();
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();
    
    // Should redirect to login page
    await expect(page).toHaveURL(/.*\/login/);
  });
});
