export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_admin: boolean;
  preferences: Record<string, unknown> | null;
}

export interface LoginResponse {
  user: User;
}

export interface Institution {
  id: string;
  name: string;
  country: string;
}

export interface Account {
  id: string;
  user_id: string;
  institution_id: string | null;
  name: string;
  account_type: "checking" | "credit" | "savings" | "cash";
  currency: "CLP" | "USD";
  balance: string;
  institution: Institution | null;
}

export interface AccountPayload {
  name: string;
  account_type: Account["account_type"];
  currency: Account["currency"];
  balance: string;
  institution_id?: string | null;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
}

export interface CategoryPayload {
  name: string;
  parent_id?: string | null;
  color?: string | null;
  icon?: string | null;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
}

export interface TagPayload {
  name: string;
  color?: string | null;
}

export interface CategoryRule {
  id: string;
  user_id: string;
  target_category_id: string;
  field: string;
  operator: string;
  pattern: string;
  priority: number;
  target_category: Category | null;
}

export interface CategoryRulePayload {
  target_category_id: string;
  field: string;
  operator: string;
  pattern: string;
  priority: number;
}

export interface TransactionSplit {
  id: string;
  transaction_id: string;
  category_id: string | null;
  amount: string;
  notes: string | null;
  category: Category | null;
}

export interface Transaction {
  id: string;
  uploaded_file_id: string;
  account_id: string;
  category_id: string | null;
  date: string;
  description: string;
  amount: string;
  currency: string;
  movement_type: "income" | "expense";
  notes: string | null;
  is_flagged: boolean;
  flag_reason: string | null;
  is_internal_transfer: boolean;
  is_duplicate: boolean;
  account: Account | null;
  category: Category | null;
  tags: Tag[];
  splits: TransactionSplit[];
}

export interface TransactionPayload {
  account_id: string;
  category_id?: string | null;
  date: string;
  description: string;
  amount: string;
  currency: string;
  movement_type: Transaction["movement_type"];
  notes?: string | null;
}

export interface SplitPayload {
  category_id?: string | null;
  amount: string;
  notes?: string | null;
}

export interface TransactionSummary {
  total_count: number;
  uncategorized_count: number;
  by_currency: Record<string, { income: string; expense: string; count: number }>;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  month: string;
  amount: string;
  alert_at_percent: number;
  category: Category | null;
}

export interface BudgetPayload {
  category_id: string;
  month: string;
  amount: string;
  alert_at_percent: number;
}

export interface MonthlyDashboard {
  month: string;
  income: string;
  expenses: string;
  balance: string;
  savings_rate: string;
  category_expenses: Array<{ category_id: string; category_name: string; amount: string }>;
  budgets: Array<{
    id: string;
    category_id: string;
    category_name: string;
    amount: string;
    spent: string;
    percent: number;
    status: "ok" | "warning" | "exceeded";
  }>;
}

export interface StatementUpload {
  id: string;
  account_id: string;
  user_id: string;
  filename: string;
  bank_detected: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
}

export interface StatementUploadResponse {
  uploaded_file: StatementUpload;
  imported_transactions: number;
  possible_duplicates: string[];
}

export interface StatementDetail {
  uploaded_file: StatementUpload;
  transactions: Transaction[];
}

export interface PreviewRow {
  date: string;
  description: string;
  amount: string;
  movement_type: "income" | "expense";
}

export interface PreviewSummary {
  total_rows: number;
  total_income: string;
  total_expenses: string;
  date_start: string | null;
  date_end: string | null;
}

export interface StatementPreview {
  id: string;
  account_id: string;
  user_id: string;
  filename: string;
  bank_detected: string | null;
  status: string;
  rows: PreviewRow[];
  summary: PreviewSummary | null;
}

export interface TransactionFilters {
  account_id?: string;
  category_id?: string;
  statement_id?: string;
  start_date?: string;
  end_date?: string;
  movement_type?: "income" | "expense";
  currency?: string;
  search?: string;
  only_uncategorized?: boolean;
  only_flagged?: boolean;
  exclude_internal?: boolean;
  exclude_duplicates?: boolean;
  limit?: number;
  offset?: number;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: string;
  current_amount: string;
  currency: string;
  target_date: string | null;
  percent: number;
}

export interface GoalPayload {
  name: string;
  target_amount: string;
  current_amount?: string;
  currency?: string;
  target_date?: string | null;
}

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

export interface Recurring {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  amount: string;
  currency: string;
  frequency: RecurringFrequency;
  movement_type: "income" | "expense";
  next_date: string | null;
  active: boolean;
}

export interface RecurringPayload {
  name: string;
  amount: string;
  currency?: string;
  frequency?: RecurringFrequency;
  movement_type?: "income" | "expense";
  category_id?: string | null;
  next_date?: string | null;
  active?: boolean;
}

export interface NetWorth {
  accounts: Array<{ id: string; name: string; account_type: string; currency: string; balance: string }>;
  totals_by_currency: Array<{ currency: string; total: string }>;
  account_count: number;
}

export interface Settings {
  email: string;
  full_name: string;
  preferences: Record<string, unknown> | null;
}

export interface SettingsPayload {
  full_name?: string;
  preferences?: Record<string, unknown>;
}
