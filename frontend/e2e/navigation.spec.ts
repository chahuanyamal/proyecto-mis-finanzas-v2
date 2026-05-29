import { expect, test } from "@playwright/test";

test("redirects unauthenticated dashboard users to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login page renders core form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/mis finanzas v2/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /ingresar/i })).toBeVisible();
  await expect(page.locator('input[type="email"], input[name="email"], input[name="username"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});
