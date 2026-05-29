import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"], input[name="username"]').first().fill(process.env.E2E_USER ?? "admin@finanzas.local");
  await page.locator('input[type="password"]').first().fill(process.env.E2E_PASSWORD ?? "admin123");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("redirects unauthenticated dashboard users to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login page renders core form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/mis finanzas/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /ingresar/i })).toBeVisible();
  await expect(page.locator('input[type="email"], input[name="email"], input[name="username"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test("authenticated user can reach core dashboard routes", async ({ page }) => {
  await login(page);
  for (const route of ["/dashboard", "/reports", "/audit", "/reconciliation", "/statements"]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(route));
    await expect(page.locator("h1").first()).toBeVisible();
  }
});
