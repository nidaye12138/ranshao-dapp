import { test, expect } from "@playwright/test";
import earningsFixture from "./fixtures/earnings.json";

/**
 * CI-safe frontend scenario suite (no wallet signing).
 * Wallet approve/burn/swap txs remain manual / Chapel smoke (see docs).
 */
test.describe("Umidor 4-tab product locks", () => {
  test("bottom nav has Home / Swap / 权重 / Mine + Umidor brand", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("brand-umidor")).toContainText("Umidor");
    await expect(page.getByTestId("tab-bar")).toBeVisible();
    await expect(page.getByTestId("tab-home")).toContainText("首页");
    await expect(page.getByTestId("tab-swap")).toContainText("Swap");
    await expect(page.getByTestId("tab-weight")).toContainText("权重");
    await expect(page.getByTestId("tab-mine")).toContainText("我的");
  });

  test("Home board shows product atmosphere copy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Umidor|四档|即时|销毁/).first()).toBeVisible();
    await expect(page.getByText("我的上级").first()).toBeVisible();
  });

  test("Swap buy/sell UI: instant 0.5%+0.5%, no buy milestones", async ({ page }) => {
    await page.goto("/swap");
    await expect(page.getByTestId("swap-buy")).toBeVisible();
    await expect(page.getByTestId("swap-sell")).toBeVisible();

    await page.getByTestId("swap-buy").click();
    await expect(page.getByText("支付 USDT")).toBeVisible();
    await expect(page.getByText(/0\.5%/).first()).toBeVisible();
    await expect(page.getByText(/无累计买入业绩|不做.*累计|无累计/).first()).toBeVisible();
    // Must not surface affirmative milestone / level UI (negative copy mentioning 级别 is OK)
    await expect(page.getByText("买入业绩级别")).toHaveCount(0);
    await expect(page.getByText("当前级别")).toHaveCount(0);
    await expect(page.getByText("业绩里程碑")).toHaveCount(0);

    await page.getByTestId("swap-sell").click();
    await expect(page.getByText("卖出 UMplan")).toBeVisible();
    await expect(page.getByText(/请先连接钱包|合约地址未配置|确认卖出/).first()).toBeVisible();
    await expect(page.getByText(/卖出瞬间|即时奖/).first()).toBeVisible();
  });

  test("权重 tab: four burn tiers 100/500/800/1500 + layer naming + 24h claim", async ({ page }) => {
    await page.goto("/promo");
    await expect(page.getByTestId("burn-tiers")).toBeVisible();
    for (const u of [100, 500, 800, 1500]) {
      await expect(page.getByTestId(`burn-tier-${u}`)).toContainText(`${u}U`);
    }
    await expect(page.getByTestId("burn-tier-2000")).toHaveCount(0);

    await expect(page.getByText("直推").first()).toBeVisible();
    await expect(page.getByText("间推").first()).toBeVisible();
    await expect(page.getByText(/市场3…市场9|市场3\.\.\.市场9|第 3–9 层/).first()).toBeVisible();
    await expect(page.getByText(/24h|24 小时/).first()).toBeVisible();
    await expect(page.getByText("SPCXB").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "领取分红" })).toBeVisible();
  });

  test("Mine: inactive gate hides invite link; earnings filters work", async ({ page }) => {
    await page.route("**/api/earnings**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(earningsFixture),
      });
    });
    await page.route("**/api/team**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "graph",
          address: earningsFixture.address,
          directs: 3,
          indirects: 8,
          buyVolumeUsd: "1200",
          umbrellaUsd: "5600",
        }),
      });
    });

    await page.goto("/mine");
    await expect(page.getByTestId("promo-link-locked")).toBeVisible();
    await expect(page.getByTestId("promo-link-locked")).toContainText("最低 100U");
    await expect(page.getByTestId("promo-link-unlocked")).toHaveCount(0);
    await expect(page.getByText("SPCXB").first()).toBeVisible();

    await expect(page.getByTestId("earnings-filters")).toBeVisible();
    await page.getByTestId("earnings-filter-swap").click();
    await page.getByTestId("earnings-filter-layer").click();
    await expect(page.getByText(/直推\/间推\/市场|层奖励/).first()).toBeVisible();
    await page.getByTestId("earnings-filter-div").click();
    await expect(page.getByText(/SPCXB|分红/).first()).toBeVisible();
  });

  test("tab navigation happy path visits all four routes", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-swap").click();
    await expect(page).toHaveURL(/\/swap/);
    await page.getByTestId("tab-weight").click();
    await expect(page).toHaveURL(/\/promo/);
    await page.getByTestId("tab-mine").click();
    await expect(page).toHaveURL(/\/mine/);
    await page.getByTestId("tab-home").click();
    await expect(page).toHaveURL(/\/?$/);
  });
});
