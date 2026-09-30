import { test, expect } from '@playwright/test';

/**
 * UI-only checks of the simple variant builder (Products -> Add Product). Nothing is saved.
 * Needs a logged-in clothes/footwear shop: set E2E_EMAIL / E2E_PASSWORD (skipped otherwise).
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe('Simple variant builder', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL / E2E_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await page.goto('/en/login');
    await page.fill('input[type="email"]', EMAIL!);
    await page.fill('input[type="password"]', PASSWORD!);
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('a:has-text("EN")').first()).toBeVisible({ timeout: 20000 });
    await page.goto('/en/products');
    await page.getByRole('button', { name: /Add Product/ }).click();
    await expect(page.getByText('Add New Product')).toBeVisible();
  });

  test('sizes x colours generate a quantity table and Apply to all fills it', async ({ page }) => {
    const sizeInput = page.getByPlaceholder(/Type & press Enter/);
    test.skip(!(await sizeInput.isVisible().catch(() => false)), 'shop has no size/colour variants');

    await sizeInput.fill('S, M, L');
    await sizeInput.press('Enter');
    await page.getByRole('button', { name: 'Red', exact: true }).click();
    await page.getByRole('button', { name: 'Blue', exact: true }).click();

    await expect(page.getByText('Enter quantity (6 variants)')).toBeVisible();

    await page.getByPlaceholder('All').fill('4');
    await page.getByRole('button', { name: 'Apply to all' }).click();
    await expect(page.getByText('Total: 24')).toBeVisible();
  });

  test('flat Stock field is hidden once variants exist', async ({ page }) => {
    const sizeInput = page.getByPlaceholder(/Type & press Enter/);
    test.skip(!(await sizeInput.isVisible().catch(() => false)), 'shop has no size/colour variants');
    await expect(page.getByText(/^Stock Qty/i)).toBeVisible();
    await sizeInput.fill('M');
    await sizeInput.press('Enter');
    await expect(page.getByText(/^Stock Qty/i)).toHaveCount(0);
  });
});
