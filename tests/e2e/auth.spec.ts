import { test, expect } from '@playwright/test';

const PACKAGES = [
  { name: 'Vyapar', email: 'rahul.gosavi8420@gmail.com', password: 'Rahul@123' },
  { name: 'Udyog', email: 'team.rgglobalservices@gmail.com', password: 'Rahul@123' }
];

test.describe('Authentication Flows', () => {
  for (const pkg of PACKAGES) {
    test(`Login as ${pkg.name} user`, async ({ page }) => {
      // Navigate to login
      await page.goto('/en/login');
      
      // Fill credentials
      await page.fill('input[type="email"]', pkg.email);
      await page.fill('input[type="password"]', pkg.password);
      
      // Submit
      await page.click('button:has-text("Sign In")');

      // Verify successful login by checking for the language switcher which is present on the dashboard
      await expect(page.locator('a:has-text("EN")').first()).toBeVisible({ timeout: 15000 });
    });
  }

  test('Negative Login (Wrong Credentials)', async ({ page }) => {
    await page.goto('/en/login');
    await page.fill('input[type="email"]', 'wronguser@example.com');
    await page.fill('input[type="password"]', 'WrongPass123!');
    await page.click('button:has-text("Sign In")');

    // Expect an error message
    const errorMsg = page.locator('text=Wrong user ID or password');
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
  });
});
