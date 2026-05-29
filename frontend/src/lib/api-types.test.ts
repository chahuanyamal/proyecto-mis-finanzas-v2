import { describe, expect, it } from "vitest";
import type {
  Account,
  DashboardSummary,
  MonthlyDashboard,
  PaginatedTransactions,
  Transaction,
  TransactionFilters,
} from "@/lib/api-types";

describe("api-types", () => {
  it("PaginatedTransactions has correct shape", () => {
    const response: PaginatedTransactions = {
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
    };
    expect(response.items).toEqual([]);
    expect(response.total).toBe(0);
    expect(response.page).toBe(1);
    expect(response.page_size).toBe(50);
  });

  it("Transaction has required fields", () => {
    const tx: Transaction = {
      id: "1",
      user_id: "u1",
      uploaded_file_id: "f1",
      account_id: "a1",
      category_id: null,
      date: "2026-01-01",
      description: "Test",
      amount: "100",
      currency: "CLP",
      movement_type: "expense",
      notes: null,
      is_flagged: false,
      flag_reason: null,
      is_internal_transfer: false,
      is_duplicate: false,
      account: null,
      category: null,
      tags: [],
      splits: [],
    };
    expect(tx.movement_type).toBe("expense");
  });

  it("TransactionFilters supports pagination params", () => {
    const filters: TransactionFilters = {
      page: 2,
      page_size: 25,
      account_id: "a1",
      movement_type: "income",
    };
    expect(filters.page).toBe(2);
    expect(filters.page_size).toBe(25);
  });

  it("DashboardSummary has change indicators", () => {
    const summary: DashboardSummary = {
      period: "mtd",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      currency: null,
      income: "1000",
      expenses: "500",
      net: "500",
      savings_rate: "50",
      income_change: "10.5",
      expenses_change: "-5.2",
      net_change: null,
      uncategorized_count: 3,
      category_expenses: [],
      recent_transactions: [],
    };
    expect(summary.income_change).toBe("10.5");
    expect(summary.net_change).toBeNull();
  });

  it("Account supports nullable institution", () => {
    const account: Account = {
      id: "a1",
      user_id: "u1",
      institution_id: null,
      name: "Cash",
      account_type: "cash",
      currency: "CLP",
      balance: "0",
      institution: null,
    };
    expect(account.institution).toBeNull();
  });

  it("MonthlyDashboard includes budgets with status", () => {
    const dashboard: MonthlyDashboard = {
      month: "2026-01",
      income: "1000",
      expenses: "800",
      balance: "200",
      savings_rate: "20",
      category_expenses: [],
      budgets: [
        { id: "b1", category_id: "c1", category_name: "Food", amount: "500", spent: "600", percent: 120, status: "exceeded" },
        { id: "b2", category_id: "c2", category_name: "Transport", amount: "200", spent: "100", percent: 50, status: "ok" },
      ],
    };
    expect(dashboard.budgets[0].status).toBe("exceeded");
    expect(dashboard.budgets[1].status).toBe("ok");
  });
});
