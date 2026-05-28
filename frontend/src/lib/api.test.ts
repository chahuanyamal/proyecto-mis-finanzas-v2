import { describe, expect, it } from "vitest";

import { authApi, statementsApi, transactionsApi } from "@/lib/api";

describe("api client", () => {
  it("builds the Excel export URL through the /api proxy", () => {
    expect(transactionsApi.exportExcelUrl()).toBe("/api/v1/transactions/export/excel");
  });

  it("exposes the expected auth operations", () => {
    expect(typeof authApi.login).toBe("function");
    expect(typeof authApi.logout).toBe("function");
    expect(typeof authApi.refresh).toBe("function");
    expect(typeof authApi.me).toBe("function");
  });

  it("exposes statement preview operations", () => {
    expect(typeof statementsApi.preview).toBe("function");
    expect(typeof statementsApi.confirm).toBe("function");
    expect(typeof statementsApi.cancel).toBe("function");
  });
});
