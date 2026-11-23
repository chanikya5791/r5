# ShopLite stack. Run `make help` for the list of targets.
COMPOSE ?= docker compose
API_TESTS_PATH ?= ../r7

.PHONY: help check-repos up seed down clean ps logs build test-e2e test-api test-all

help:
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

check-repos: ## Check the sibling repos are checked out
	@./scripts/check-repos.sh

build: check-repos ## Build all service images
	$(COMPOSE) build

up: check-repos ## Build and start everything, wait until healthy, then seed demo data
	$(COMPOSE) up -d --build --wait
	$(MAKE) seed
	@echo ""
	@echo "ShopLite is up:  UI http://localhost:8080   admin@shoplite.local / Admin123!   demo@shoplite.local / Demo1234!"

seed: ## Load demo products and the demo customer (idempotent)
	$(COMPOSE) --profile seed run --rm seed

ps: ## Show service status
	$(COMPOSE) ps

logs: ## Follow logs from all services
	$(COMPOSE) logs -f --tail=100

down: ## Stop everything (keeps data)
	$(COMPOSE) down

clean: ## Stop everything and delete the data volumes
	$(COMPOSE) down -v --remove-orphans

test-e2e: ## Run the Playwright UI tests against the running stack
	cd e2e && npm ci && npx playwright test

test-api: ## Run the full-stack API test suite (r7) against the running stack
	cd $(API_TESTS_PATH) && npm ci && npm test

test-all: test-api test-e2e ## Run API and UI tests
