import { expect, test } from '@playwright/test';
import { ADMIN, apiLogin, loginInBrowser, newCustomer, uid } from './helpers';

test('admin creates, edits and deletes a product in the UI', async ({ page, request }) => {
  await loginInBrowser(page, await apiLogin(request, ADMIN.email, ADMIN.password));
  const sku = `UI-${uid()}`;

  await page.goto('/');
  await page.getByRole('link', { name: 'New product' }).click();
  await page.getByLabel('SKU').fill(sku);
  await page.getByLabel('Name').fill(`Admin Lamp ${sku}`);
  await page.getByLabel('Description').fill('Made in the admin test');
  await page.getByLabel('Category').fill('lighting');
  await page.getByLabel('Price (USD)').fill('42.50');
  await page.getByLabel('Stock').fill('7');
  await page.getByRole('button', { name: 'Save product' }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('searchbox', { name: 'Search products' }).fill(sku);
  const card = page.getByTestId('product-card');
  await expect(card).toContainText('$42.50');
  await expect(card.getByTestId('product-stock')).toHaveText('7 in stock');

  await card.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('SKU')).toBeDisabled();
  await page.getByLabel('Stock').fill('0');
  await page.getByRole('button', { name: 'Save product' }).click();
  await page.getByRole('searchbox', { name: 'Search products' }).fill(sku);
  await expect(page.getByTestId('product-card').getByTestId('product-stock')).toHaveText('Out of stock');

  page.once('dialog', (d) => d.accept());
  await page.getByTestId('product-card').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No products match.')).toBeVisible();
});

test('duplicate SKUs are rejected with a readable error', async ({ page, request }) => {
  await loginInBrowser(page, await apiLogin(request, ADMIN.email, ADMIN.password));
  const sku = `DUP-${uid()}`;
  for (let i = 0; i < 2; i++) {
    await page.goto('/admin/products/new');
    await page.getByLabel('SKU').fill(sku);
    await page.getByLabel('Name').fill('Duplicate');
    await page.getByLabel('Category').fill('e2e');
    await page.getByLabel('Price (USD)').fill('1');
    await page.getByRole('button', { name: 'Save product' }).click();
  }
  await expect(page.getByRole('alert')).toContainText(`A product with SKU ${sku} already exists`);
});

test('customers do not get admin pages', async ({ page, request }) => {
  await loginInBrowser(page, await newCustomer(request));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'New product' })).toHaveCount(0);
  await page.goto('/admin/reports');
  await expect(page.getByText('You need the admin role to see this page.')).toBeVisible();
});

test("admin sees the jobs worker's daily report", async ({ page, request }) => {
  await loginInBrowser(page, await apiLogin(request, ADMIN.email, ADMIN.password));
  await page.goto('/admin/reports');
  // The jobs worker rebuilds today's summary every SUMMARY_INTERVAL_MS (10 s in docker-compose).
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('daily-report')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId('daily-report')).toContainText('Orders');
});
