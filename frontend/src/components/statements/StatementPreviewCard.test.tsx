import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StatementPreviewCard from "@/components/statements/StatementPreviewCard";
import type { StatementPreview } from "@/lib/api-types";

// El componente importa el cliente axios; lo aislamos para no tocar la red.
vi.mock("@/lib/api", () => ({
  statementsApi: {
    updateRows: vi.fn(),
    deleteRow: vi.fn(),
    checkDuplicates: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
  },
}));

function buildPreview(overrides: Partial<StatementPreview> = {}): StatementPreview {
  return {
    id: "p1",
    account_id: "acc1",
    user_id: "u1",
    filename: "cartola-itau.pdf",
    bank_detected: "itau:text",
    status: "pending",
    rows: [
      { date: "2026-05-01", description: "Sueldo", amount: "1000", movement_type: "income" },
      { date: "2026-05-02", description: "Supermercado", amount: "250", movement_type: "expense" },
    ],
    summary: {
      total_rows: 2,
      total_income: "1000",
      total_expenses: "250",
      date_start: "2026-05-01",
      date_end: "2026-05-02",
    },
    ...overrides,
  };
}

describe("StatementPreviewCard", () => {
  it("renders the filename, detected bank and parsed rows", () => {
    render(<StatementPreviewCard preview={buildPreview()} onChanged={() => {}} />);

    expect(screen.getByText("cartola-itau.pdf")).toBeInTheDocument();
    expect(screen.getByText(/itau:text/)).toBeInTheDocument();
    expect(screen.getByText("Sueldo")).toBeInTheDocument();
    expect(screen.getByText("Supermercado")).toBeInTheDocument();
  });

  it("shows the empty state when there are no rows", () => {
    render(<StatementPreviewCard preview={buildPreview({ rows: [] })} onChanged={() => {}} />);

    expect(screen.getByText(/Todas fueron excluidas/i)).toBeInTheDocument();
  });
});
