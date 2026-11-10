.PHONY: test test-full-scenario test-contracts test-e2e test-contracts-scenario

# Default / CI entrypoint — Foundry + Playwright full scenario suite
test: test-full-scenario

test-full-scenario:
	bash scripts/run-full-scenario.sh

test-contracts:
	cd contracts && forge test --summary

test-contracts-scenario:
	cd contracts && forge test --match-contract FullScenario --summary

test-e2e:
	npm --prefix apps/web run test:e2e
