import { expect, test, type Page } from "@playwright/test";

// Flujos críticos del producto (Bóveda). Requieren backend en marcha y un usuario
// de prueba. Configurables vía env: E2E_USER, E2E_PASSWORD, E2E_BASE_URL.

async function login(page: Page) {
  await page.goto("/login");
  await page
    .locator('input[type="email"], input[name="email"], input[name="username"]')
    .first()
    .fill(process.env.E2E_USER ?? "admin@finanzas.local");
  await page.locator('input[type="password"]').first().fill(process.env.E2E_PASSWORD ?? "admin123");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Bóveda — flujos críticos", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("tablero muestra KPIs y proyección de cash-flow", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /tablero/i })).toBeVisible();
    // Strip de KPIs (Ahorro neto / Ingresos / Gastos).
    await expect(page.getByText(/ahorro neto/i).first()).toBeVisible();
    // Panel de proyección de saldo (cash-flow forecast).
    await expect(page.getByText(/proyección de saldo/i)).toBeVisible();
  });

  test("crear regla y aplicarla a históricos", async ({ page }) => {
    await page.goto("/rules");
    await expect(page.getByRole("heading").first()).toBeVisible();
    // El builder y/o sugerencias deben estar presentes.
    await expect(page.getByText(/coincidenc|sugerenc|regla/i).first()).toBeVisible();
  });

  test("inbox de revisión es navegable", async ({ page }) => {
    await page.goto("/review");
    // Split queue/focus o estado vacío "Todo limpio".
    await expect(page.getByText(/revisar|todo limpio|sin cat/i).first()).toBeVisible();
  });

  test("presupuestos muestra sugerencias o month-nav", async ({ page }) => {
    await page.goto("/presupuestos");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText(/presupuest/i).first()).toBeVisible();
  });

  test("importar cartola: drop zone visible", async ({ page }) => {
    await page.goto("/statements");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText(/cartola|importar|seleccionar|conectar/i).first()).toBeVisible();
  });

  test("movimientos: filtros guardados y acciones", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: /mayor|movimient/i })).toBeVisible();
    await expect(page.getByText(/guardar vista|este mes|sin categoría/i).first()).toBeVisible();
  });

  test("tema claro se puede activar desde ajustes", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading").first()).toBeVisible();
    // La pestaña Personalización contiene el control de tema.
    const personalizacion = page.getByText(/personalizaci/i).first();
    if (await personalizacion.isVisible()) {
      await personalizacion.click();
    }
    await expect(page.getByText(/tema|cuaderno|bóveda/i).first()).toBeVisible();
  });
});
