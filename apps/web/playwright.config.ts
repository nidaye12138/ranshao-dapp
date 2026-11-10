import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3100);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT} --hostname 127.0.0.1`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          // Leave module addresses empty so UI stays CI-safe without wallet/RPC.
          NEXT_PUBLIC_TOKEN_ADDRESS: "0xad09D287327C383283820CfCEe7AC0e6C7De7777",
          NEXT_PUBLIC_SPCXB_ADDRESS: "0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1",
          NEXT_PUBLIC_USDT_ADDRESS: "0x55d398326f99059fF775485246999027B3197955",
        },
      },
});
