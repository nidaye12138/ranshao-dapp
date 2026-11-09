#!/usr/bin/env node
/**
 * Patch subgraph.yaml addresses/startBlocks/network from:
 *   1) env: SUBGRAPH_NETWORK, REGISTRY_ADDRESS, SWAP_ADDRESS, BURN_ADDRESS,
 *           LAYER_ADDRESS, DIVIDENDS_ADDRESS, START_BLOCK
 *   2) networks.json for the chosen network
 *   3) optional --from=../deployments/bsc-testnet.json (ReferralTree, SwapFacade, …)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const network = process.env.SUBGRAPH_NETWORK || "chapel";
const networksPath = join(root, "networks.json");
const yamlPath = join(root, "subgraph.yaml");

const networks = JSON.parse(readFileSync(networksPath, "utf8"));
if (!networks[network]) {
  console.error(`Unknown network "${network}". Use keys: ${Object.keys(networks).join(", ")}`);
  process.exit(1);
}

const cfg = { ...networks[network] };

const envMap = {
  ReferralTree: process.env.REGISTRY_ADDRESS || process.env.REFERRAL_TREE_ADDRESS,
  SwapFacade: process.env.SWAP_ADDRESS,
  BurnRouter: process.env.BURN_ADDRESS,
  LayerRewards: process.env.LAYER_ADDRESS || process.env.LAYER_REWARDS_ADDRESS,
  DividendPools: process.env.DIVIDENDS_ADDRESS,
};

const startBlockEnv = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;

const fromArg = process.argv.find((a) => a.startsWith("--from="));
if (fromArg) {
  const deployPath = fromArg.slice("--from=".length);
  if (!existsSync(deployPath)) {
    console.error(`Deploy file not found: ${deployPath}`);
    process.exit(1);
  }
  const dep = JSON.parse(readFileSync(deployPath, "utf8"));
  const alias = {
    ReferralTree: dep.ReferralTree || dep.registry,
    SwapFacade: dep.SwapFacade || dep.swap,
    BurnRouter: dep.BurnRouter || dep.burn,
    LayerRewards: dep.LayerRewards || dep.layers,
    DividendPools: dep.DividendPools || dep.dividends,
  };
  for (const [name, addr] of Object.entries(alias)) {
    if (addr) {
      cfg[name] = { ...(cfg[name] || {}), address: addr };
    }
  }
  if (dep.startBlock != null) {
    for (const name of Object.keys(cfg)) {
      cfg[name].startBlock = dep.startBlock;
    }
  }
}

for (const [name, addr] of Object.entries(envMap)) {
  if (addr) cfg[name] = { ...(cfg[name] || {}), address: addr };
}
if (startBlockEnv != null) {
  for (const name of Object.keys(cfg)) {
    cfg[name] = { ...cfg[name], startBlock: startBlockEnv };
  }
}

let yaml = readFileSync(yamlPath, "utf8");
// Set network on every dataSource
yaml = yaml.replace(/^( {4}network: ).+$/gm, `$1${network}`);

const names = ["ReferralTree", "SwapFacade", "BurnRouter", "LayerRewards", "DividendPools"];
for (const name of names) {
  const entry = cfg[name];
  if (!entry?.address) continue;
  // Replace the address block for this datasource by name-scoped heuristics:
  // find `name: ${name}` then next `address:` and `startBlock:`
  const nameRe = new RegExp(
    `(name: ${name}[\\s\\S]*?source:\\s*\\n\\s*address: ")[^"]+("\\s*\\n\\s*abi: [^\\n]+\\n\\s*startBlock: )\\d+`,
    "m"
  );
  if (!nameRe.test(yaml)) {
    console.warn(`Could not patch datasource ${name}`);
    continue;
  }
  yaml = yaml.replace(nameRe, `$1${entry.address}$2${entry.startBlock ?? 0}`);
}

writeFileSync(yamlPath, yaml);
writeFileSync(networksPath, JSON.stringify({ ...networks, [network]: cfg }, null, 2) + "\n");
console.log(`Prepared subgraph.yaml for network=${network}`);
for (const name of names) {
  console.log(`  ${name}: ${cfg[name]?.address || "(missing)"} @ ${cfg[name]?.startBlock ?? 0}`);
}
