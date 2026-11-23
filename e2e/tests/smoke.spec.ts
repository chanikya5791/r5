import { expect, test } from '@playwright/test';

test('home page lists products and the navigation works for guests', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Orders' })).toHaveCount(0);
});

test('guests are sent to the login page for protected pages', async ({ page }) => {
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});

test('every service reports healthy through the UI proxy', async ({ request }) => {
  for (const path of ['/health', '/api/users/health', '/api/catalog/health', '/api/orders/health']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect((await res.json()).status, path).toBe('ok');
  }
});
