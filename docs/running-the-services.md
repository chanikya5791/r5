# Running the ShopLite services

This guide covers three ways to run ShopLite:

1. **[Everything in Docker](#1-everything-in-docker)**: one command. Use this to test the app.
2. **[Databases in Docker, services from source](#2-databases-in-docker-services-from-source)**: hot reload while you change code.
3. **[One service on its own](#3-one-service-on-its-own)**: work on a single repo.

The last sections cover [checking it works](#checking-that-everything-works), [stopping and resetting](#stopping-and-resetting),
[configuration](#configuration) and [troubleshooting](#troubleshooting).

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Docker with Compose v2 (`docker compose`) | Docker 24+ | everything |
| `make` | any | the shortcuts below (each target is a plain `docker compose` command, shown in the [Makefile](../Makefile)) |
| Node.js | 22 | options 2 and 3, and running the tests |
| Git | any | cloning |

Give Docker at least **4 GB of memory**. Kafka and MongoDB are the heaviest parts of the stack.

The stack uses these host ports: **8080, 3001–3004, 5432, 27017, 9094**. To change them, see [Configuration](#configuration).

## Get the code

All seven repos must sit **side by side** in one folder, because docker-compose builds the services from `../r1`,
`../r2` and so on.

```bash
mkdir shoplite && cd shoplite
for r in r1 r2 r3 r4 r5 r6 r7; do
  git clone -b ccr-7b98c79f-jzysu6 https://github.com/chanikya5791/$r
done
```

```
shoplite/
├── r1  UI
├── r2  Orders API
├── r3  Catalog API
├── r4  Jobs worker
├── r5  Infra (you run commands from here)
├── r6  Users API
└── r7  API tests
```

If the repos live somewhere else, copy `r5/.env.example` to `r5/.env` and set `UI_PATH`, `ORDERS_API_PATH`,
`CATALOG_API_PATH`, `JOBS_PATH` and `USERS_API_PATH`. `make check-repos` confirms that they are all found.

---

## 1. Everything in Docker

```bash
cd r5
make up
```

`make up` does the following:

1. Checks that the sibling repos exist (`scripts/check-repos.sh`).
2. Runs `docker compose up -d --build --wait`. This builds the five service images and starts all containers in
   dependency order. It returns only when every health check passes.
3. Runs `make seed`, which loads 12 demo products and a demo customer through the APIs. It is safe to run again.

The first run downloads base images and npm packages, so it takes a few minutes. Later runs take about 30 seconds.

When it finishes, open **http://localhost:8080**.

| Account | Email | Password |
|---|---|---|
| Admin | `admin@shoplite.local` | `Admin123!` |
| Customer | `demo@shoplite.local` | `Demo1234!` |

### Start-up order

docker-compose waits for each step's health check before starting the next:

```
postgres, mongo, kafka               (databases and broker)
        │
        ├── kafka-init               creates topics, then exits
        ├── users-api   :3001        needs postgres
        ├── catalog-api :3003        needs mongo
        │
        ├── orders-api  :3002        needs postgres, kafka-init, catalog-api
        ├── jobs        :3004        needs kafka-init, postgres, mongo, orders-api
        │                            (orders-api creates the orders table the worker updates)
        └── ui          :8080        needs all three APIs
```

### Useful commands

| Command | What it does |
|---|---|
| `make ps` | Status and health of each container |
| `make logs` | Follow the logs of all services |
| `docker compose logs -f orders-api jobs` | Follow the logs of particular services |
| `docker compose up -d --build orders-api` | Rebuild and restart one service after changing its code |
| `docker compose restart jobs` | Restart a service without rebuilding |
| `make seed` | Load the demo data again |
| `make help` | List every target |

---

## 2. Databases in Docker, services from source

Use this option to change code and see the result immediately. The databases run in Docker; each service runs
with `npm run dev`, which reloads on save.

**Step 1: start only the infrastructure** (from `r5`):

```bash
docker compose up -d --wait postgres mongo kafka
docker compose up kafka-init          # creates the topics, then exits
```

From your machine, these are reachable at `localhost:5432` (Postgres), `localhost:27017` (MongoDB) and
`localhost:9094` (Kafka). Each service's `.env.example` already points at these addresses.

**Step 2: start each service in its own terminal.** Use this order, because the jobs worker needs the `orders`
table that the Orders API creates on start-up:

```bash
cd r6 && cp .env.example .env && npm ci && npm run dev     # Users API    http://localhost:3001
cd r3 && cp .env.example .env && npm ci && npm run dev     # Catalog API  http://localhost:3003
cd r2 && cp .env.example .env && npm ci && npm run dev     # Orders API   http://localhost:3002
cd r4 && cp .env.example .env && npm ci && npm run dev     # Jobs worker  http://localhost:3004/health
cd r1 && npm ci && npm run dev                             # UI           http://localhost:5173
```

The UI dev server (Vite) proxies `/api/users`, `/api/catalog` and `/api/orders` to ports 3001, 3003 and 3002, so
there are no CORS issues.

**Step 3: load the demo data.** Run this from `r5`, after the Users and Catalog APIs are up:

```bash
USERS_API_URL=http://localhost:3001 CATALOG_API_URL=http://localhost:3003 node seed/seed.mjs
```

> In this mode, new orders are processed immediately, because `PROCESSING_DELAY_MS` defaults to `0`. Set it to
> `1500` in `r4/.env` to see orders sit in `PENDING` first, as they do in Docker.

You can also mix the two modes. For example, run everything in Docker except the service you are working on:

```bash
docker compose stop orders-api
cd ../r2 && npm run dev
```

Containers reach each other by service name, not `localhost`. So mixing works well for services that nothing else
calls (the jobs worker and the UI). For the APIs, the other containers keep calling the container address, so
your local copy only receives requests you send to it directly.

---

## 3. One service on its own

Each service repo has unit tests that need nothing, and integration tests that start their own throwaway
databases with Testcontainers. Docker must be running, but you don't need to start any database yourself.

```bash
cd r2              # or r3, r4, r6
npm ci
npm run test:unit
npm run test:integration
```

To run a single service against your own databases, copy its `.env.example` to `.env`, edit the connection
strings, and run `npm run dev`. The variables for each service are listed in its README.

---

## Checking that everything works

**Health endpoints.** Each returns `{"status":"ok", ...}` with the state of its dependencies:

```bash
for p in 3001 3002 3003 3004; do curl -s localhost:$p/health; echo; done
curl -s localhost:8080/health
```

**Smoke test from the command line.** This logs in, places an order, and watches the worker process it:

```bash
TOKEN=$(curl -s localhost:3001/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo@shoplite.local","password":"Demo1234!"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
PRODUCT=$(curl -s 'localhost:3003/products?q=MUG-001' | sed -E 's/.*"items":\[\{"id":"([^"]+)".*/\1/')

ORDER=$(curl -s localhost:3002/orders -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"items\":[{\"productId\":\"$PRODUCT\",\"quantity\":1}]}" | sed -E 's/.*"id":"([^"]+)","userId".*/\1/')

sleep 3
curl -s localhost:3002/orders/$ORDER -H "authorization: Bearer $TOKEN"                 # "status":"PROCESSED"
curl -s "localhost:3003/activity?orderId=$ORDER" -H "authorization: Bearer $TOKEN"     # ORDER_RECEIVED, STOCK_RESERVED, ORDER_PROCESSED
```

**Test suites** (against the running stack, from `r5`):

```bash
make test-api      # r7: 84 API tests (about 25 s)
make test-e2e      # r5/e2e: Playwright UI tests (run `npx playwright install chromium` once first)
make test-all      # both
cd ../r7 && npm run test:newman    # the Postman collection
```

**Looking inside the data stores:**

```bash
docker compose exec postgres psql -U shoplite -d orders -c "SELECT id, status, total_cents FROM orders ORDER BY created_at DESC LIMIT 5;"
docker compose exec mongo mongosh catalog --quiet --eval "db.activity.find().sort({createdAt:-1}).limit(5)"
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka:9092 --topic order.created --from-beginning --max-messages 3
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group shoplite-jobs
```

## Stopping and resetting

| Command | Effect |
|---|---|
| `make down` | Stops and removes the containers. **Data is kept** in the `pgdata` and `mongodata` volumes. |
| `make up` | Starts again with the same data |
| `make clean` | Stops everything and **deletes all data** (volumes). The next `make up` starts fresh. |

Kafka has no volume, so its topics and messages do not survive `make down`. `kafka-init` recreates the topics on
the next start.

## Configuration

All settings are optional. Copy `r5/.env.example` to `r5/.env` and change what you need:

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | `dev-secret-change-me` | Shared by all three APIs; must be the same everywhere |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `admin@shoplite.local`, `Admin123!` | Admin account created by the Users API on first start |
| `UI_PORT`, `USERS_API_PORT`, `ORDERS_API_PORT`, `CATALOG_API_PORT`, `JOBS_HEALTH_PORT` | 8080, 3001, 3002, 3003, 3004 | Host ports for the services |
| `POSTGRES_PORT`, `MONGO_PORT`, `KAFKA_PORT` | 5432, 27017, 9094 | Host ports for the data stores |
| `PROCESSING_DELAY_MS` | `1500` | How long the worker holds each new order (so `PENDING` is visible) |
| `SUMMARY_INTERVAL_MS` | `10000` | How often the worker rebuilds today's report |
| `UI_PATH`, `ORDERS_API_PATH`, ... | `../r1`, `../r2`, ... | Where the service repos are |

After changing `.env`, run `make up` again; compose recreates only the containers whose settings changed. If
you change `ADMIN_*` after the first start, also run `make clean`, because the admin is only created when it
does not exist yet.

The variables for each service on its own are listed in its `.env.example` and README.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Missing ../r2 (set ORDERS_API_PATH ...)` | The repos are not side by side. Clone them next to `r5`, or set the paths in `.env`. |
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | Something else (often a local Postgres or MongoDB) uses that port. Stop it, or change `POSTGRES_PORT` (and the other ports) in `.env`. |
| `toomanyrequests` / `429` when pulling images | Docker Hub's anonymous pull limit. Run `docker login`, or wait and retry. |
| `make up` fails with `dependency failed to start` | Run `docker compose ps` to see which container is unhealthy, then `docker compose logs <service>`. Kafka can be slow on a first start; running `make up` again usually succeeds. |
| `npm ci` fails during the image build | The build cannot reach the npm registry. Behind a corporate proxy, configure Docker's proxy settings for builds. |
| The orders API is `unhealthy` with `kafka: down` | Kafka is not reachable or the topics are missing. Run `docker compose up kafka-init` and check `docker compose logs kafka`. |
| Orders stay `PENDING` | The jobs worker is not running or not consuming. Check `curl localhost:3004/health` and `docker compose logs jobs`. Messages that failed three times are in the `order.created.dlq` topic. |
| `Invalid token` after changing `JWT_SECRET` | Old tokens no longer verify. Log out and in again (in the UI, clear site data). |
| Login as admin fails after changing `ADMIN_PASSWORD` | The admin already existed with the old password. Run `make clean && make up`. |
| Not enough memory, or containers killed | Give Docker at least 4 GB. Kafka and MongoDB need the most. |
| On Apple Silicon or ARM | All images are multi-arch; no changes needed. |
