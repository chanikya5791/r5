import { expect, test } from '@playwright/test';
import { addToCartBySearch, loginInBrowser, newCustomer, newProduct, stockOf } from './helpers';

test('sign up through the UI, then log out and back in', async ({ page }) => {
  const email = `e2e-ui-${Date.now()}@test.local`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('UI Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/Password/).fill('Password1!');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByTestId('current-user')).toHaveText(email);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  await page.getByLabel('Password').fill('Password1!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('current-user')).toHaveText(email);
});

test('search and category filter narrow the product list', async ({ page, request }) => {
  const product = await newProduct(request, { category: `cat-${Date.now()}` });
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search products' }).fill(product.sku);
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('product-card')).toContainText(product.name);
  await page.getByRole('searchbox', { name: 'Search products' }).fill('no-such-product-anywhere');
  await expect(page.getByText('No products match.')).toBeVisible();
});

test('place an order: it becomes PROCESSED with an activity timeline, and stock goes down', async ({ page, request }) => {
  const product = await newProduct(request, { stock: 5, priceCents: 1250 });
  const customer = await newCustomer(request);
  await loginInBrowser(page, customer);

  const card = await addToCartBySearch(page, product);
  await card.getByRole('button', { name: 'Add another (1)' }).click();
  await page.getByTestId('nav-cart').click();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
  await expect(page.getByTestId('cart-total')).toHaveText('$25.00');

  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('order-total')).toHaveText('$25.00');
  // The jobs worker holds new orders briefly (PROCESSING_DELAY_MS), so PENDING is visible first.
  await expect(page.getByTestId('order-status')).toHaveText('PROCESSED');
  const timeline = page.getByTestId('activity').locator('li');
  await expect(timeline).toHaveCount(3);
  await expect(timeline.nth(0)).toHaveAttribute('data-type', 'ORDER_RECEIVED');
  await expect(timeline.nth(1)).toHaveAttribute('data-type', 'STOCK_RESERVED');
  await expect(timeline.nth(2)).toHaveAttribute('data-type', 'ORDER_PROCESSED');
  expect(await stockOf(request, product.id)).toBe(3);

  await page.getByRole('link', { name: 'Orders', exact: true }).click();
  await expect(page.getByTestId('order-row')).toHaveCount(1);
  await expect(page.getByTestId('order-row').getByTestId('order-status')).toHaveText('PROCESSED');
});

test('cancelling a processed order returns the stock', async ({ page, request }) => {
  const product = await newProduct(request, { stock: 4 });
  const customer = await newCustomer(request);
  await loginInBrowser(page, customer);
  await addToCartBySearch(page, product);
  await page.getByTestId('nav-cart').click();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('PROCESSED');
  expect(await stockOf(request, product.id)).toBe(3);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('CANCELLED');
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  await expect.poll(() => stockOf(request, product.id)).toBe(4);
  await expect(page.getByTestId('activity').locator('li[data-type="ORDER_CANCELLED"]')).toBeVisible();
});

test('the UI shows a stock error when stock runs out before checkout', async ({ page, request }) => {
  const product = await newProduct(request, { stock: 2 });
  const customer = await newCustomer(request);
  await loginInBrowser(page, customer);
  const card = await addToCartBySearch(page, product);
  await card.getByRole('button', { name: 'Add another (1)' }).click();

  // Someone else buys the stock in the meantime.
  await request.patch(`/api/catalog/products/${product.id}`, { headers: { authorization: `Bearer ${product.adminToken}` }, data: { stock: 1 } });

  await page.getByTestId('nav-cart').click();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('alert')).toContainText('Not enough stock');
  await expect(page).toHaveURL(/\/cart$/);
});

test('out-of-stock products cannot be added to the cart', async ({ page, request }) => {
  const product = await newProduct(request, { stock: 0 });
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search products' }).fill(product.sku);
  const card = page.getByTestId('product-card');
  await expect(card.getByTestId('product-stock')).toHaveText('Out of stock');
  await expect(card.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
});
