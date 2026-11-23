import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@shoplite.local', password: process.env.ADMIN_PASSWORD ?? 'Admin123!' };

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();

export interface Session {
  token: string;
  user: { id: string; email: string; name: string; role: string; createdAt: string };
}

export async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<Session> {
  const res = await request.post('/api/users/auth/login', { data: { email, password } });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

export async function newCustomer(request: APIRequestContext) {
  const email = `e2e-${uid().toLowerCase()}@test.local`;
  const password = 'Password1!';
  const res = await request.post('/api/users/auth/register', { data: { email, password, name: 'E2E Customer' } });
  expect(res.status()).toBe(201);
  return { email, password, ...(await apiLogin(request, email, password)) };
}

/** Creates a product through the Catalog API as admin, with a unique SKU and name. */
export async function newProduct(request: APIRequestContext, over: { stock?: number; priceCents?: number; category?: string } = {}) {
  const admin = await apiLogin(request, ADMIN.email, ADMIN.password);
  const id = uid();
  const res = await request.post('/api/catalog/products', {
    headers: { authorization: `Bearer ${admin.token}` },
    data: { sku: `E2E-${id}`, name: `E2E Product ${id}`, description: 'Created by Playwright', category: over.category ?? 'e2e', priceCents: over.priceCents ?? 1250, stock: over.stock ?? 5 },
  });
  expect(res.status(), await res.text()).toBe(201);
  return { ...(await res.json()), adminToken: admin.token } as { id: string; sku: string; name: string; stock: number; priceCents: number; adminToken: string };
}

export async function stockOf(request: APIRequestContext, productId: string): Promise<number> {
  return (await (await request.get(`/api/catalog/products/${productId}/stock`)).json()).stock;
}

/** Starts the page already logged in (same storage keys the UI uses). */
export async function loginInBrowser(page: Page, session: Session) {
  await page.addInitScript(([token, user]) => {
    localStorage.setItem('shoplite.token', JSON.stringify(token));
    localStorage.setItem('shoplite.user', JSON.stringify(user));
  }, [session.token, session.user] as const);
}

export async function addToCartBySearch(page: Page, product: { name: string; sku: string }) {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search products' }).fill(product.sku);
  const card = page.locator(`[data-testid="product-card"][data-sku="${product.sku}"]`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Add/ }).click();
  return card;
}
