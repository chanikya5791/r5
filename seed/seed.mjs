// Seeds demo data through the public APIs (so it exercises them too). Idempotent: existing SKUs and users are skipped.
const USERS = process.env.USERS_API_URL ?? 'http://localhost:3001';
const CATALOG = process.env.CATALOG_API_URL ?? 'http://localhost:3003';
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@shoplite.local', password: process.env.ADMIN_PASSWORD ?? 'Admin123!' };

const products = [
  ['MUG-001', 'Stoneware Coffee Mug', 'kitchen', 1499, 40, '350 ml, dishwasher safe.'],
  ['MUG-002', 'Insulated Travel Mug', 'kitchen', 2499, 25, 'Keeps drinks hot for 6 hours.'],
  ['KTL-001', 'Gooseneck Kettle', 'kitchen', 5999, 8, 'Pour-over friendly, 1 litre.'],
  ['BOOK-001', 'The Pragmatic Tester', 'books', 3499, 15, 'Practical habits for software testing.'],
  ['BOOK-002', 'Distributed Systems in Practice', 'books', 4599, 10, 'Queues, retries and idempotency explained.'],
  ['BOOK-003', 'Field Guide to Kafka', 'books', 3999, 3, 'A short guide to topics, partitions and consumer groups.'],
  ['KB-001', 'Mechanical Keyboard', 'electronics', 8999, 12, 'Tenkeyless, hot-swappable switches.'],
  ['MSE-001', 'Wireless Mouse', 'electronics', 2999, 30, 'Silent clicks, USB-C charging.'],
  ['HUB-001', 'USB-C Hub', 'electronics', 3999, 0, '7-in-1 hub. Currently out of stock.'],
  ['TEE-001', 'ShopLite T-Shirt', 'apparel', 1999, 50, '100% cotton.'],
  ['CAP-001', 'ShopLite Cap', 'apparel', 1799, 2, 'One size fits most.'],
  ['NB-001', 'Dotted Notebook', 'stationery', 999, 100, 'A5, 160 pages.'],
];

async function call(method, url, body, token) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

const login = await call('POST', `${USERS}/auth/login`, ADMIN);
if (login.status !== 200) throw new Error(`Admin login failed: ${login.status} ${JSON.stringify(login.body)}`);
const token = login.body.token;

let created = 0;
for (const [sku, name, category, priceCents, stock, description] of products) {
  const res = await call('POST', `${CATALOG}/products`, { sku, name, category, priceCents, stock, description }, token);
  if (res.status === 201) created++;
  else if (res.status !== 409) throw new Error(`Creating ${sku} failed: ${res.status} ${JSON.stringify(res.body)}`);
}

const demo = await call('POST', `${USERS}/auth/register`, { email: 'demo@shoplite.local', password: 'Demo1234!', name: 'Demo Customer' });
if (![201, 409].includes(demo.status)) throw new Error(`Creating demo user failed: ${demo.status}`);

console.log(`Seed done: ${created} new product(s), ${products.length - created} already present. Demo login: demo@shoplite.local / Demo1234!`);
