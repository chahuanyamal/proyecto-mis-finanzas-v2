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
  user_id: string | null;
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

export interface AutoCategorizeResult {
  updated: number;
}

export interface RulePreviewSample {
  id: string;
  date: string;
  description: string;
  amount: string;
  has_category: boolean;
}

export interface RulePreviewResult {
  count: number;
  uncategorized: number;
  samples: RulePreviewSample[];
}

export interface RuleApplyResult {
  matched: number;
  updated: number;
}

export type SearchEntity = "transaction" | "account" | "category" | "tag" | "rule" | "statement";

export interface SearchHit {
  entity: SearchEntity;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export interface SearchResponse {
  q: string;
  hits: SearchHit[];
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
  user_id: string;
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

export interface CategoryAggregate {
  category_id: string | null;
  category_name: string;
  income: string;
  expense: string;
  count: number;
}

export interface MonthAggregate {
  month: string;
  income: string;
  expense: string;
}

export interface RangeFilters {
  account_id?: string;
  start_date?: string;
  end_date?: string;
  currency?: string;
  exclude_internal?: boolean;
  exclude_duplicates?: boolean;
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

export type DashboardPeriod = "mtd" | "30d" | "ytd" | "12m";

export interface DashboardSummary {
  period: DashboardPeriod;
  date_from: string;
  date_to: string;
  currency: string | null;
  income: string;
  expenses: string;
  net: string;
  savings_rate: string;
  income_change: string | null;
  expenses_change: string | null;
  net_change: string | null;
  uncategorized_count: number;
  category_expenses: Array<{
    category_id: string;
    category_name: string;
    category_color: string | null;
    amount: string;
    count: number;
  }>;
  recent_transactions: Array<{
    id: string;
    date: string;
    description: string;
    amount: string;
    currency: string;
    movement_type: "income" | "expense";
    account_name: string;
    category_name: string | null;
    category_color: string | null;
  }>;
}

export interface DashboardTrends {
  months: number;
  currency: string | null;
  trends: Array<{ month: string; income: string; expenses: string; net: string }>;
}

export interface StatementUpload {
  id: string;
  account_id: string;
  user_id: string;
  filename: string;
  bank_detected: string | null;
  period_start: string | null;
  period_end: string | null;
  opening_balance: string | null;
  closing_balance: string | null;
  status: string;
}

export interface StatementUploadResponse {
  uploaded_file: StatementUpload;
  imported_transactions: number;
  possible_duplicates: string[];
}

export interface ParserOption {
  key: string;
  display_name: string;
  subformats: Array<{ key: string; label: string; hint?: string }>;
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

export interface GoalDepositPayload {
  amount: string;
  date?: string | null;
  note?: string | null;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  user_id: string;
  date: string;
  amount: string;
  note: string | null;
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

export interface RecurringDetectResult {
  detected: number;
  created: number;
  items: Array<{
    name: string;
    amount: string;
    currency: string;
    movement_type: "income" | "expense";
    frequency: RecurringFrequency;
    next_date: string | null;
    occurrences: number;
  }>;
}

export interface UpcomingRecurring {
  id: string;
  name: string;
  amount: string;
  currency: string;
  movement_type: "income" | "expense";
  frequency: RecurringFrequency;
  due_date: string;
  days_until: number;
}

export interface NetWorth {
  accounts: Array<{ id: string; name: string; account_type: string; currency: string; balance: string }>;
  totals_by_currency: Array<{ currency: string; total: string }>;
  account_count: number;
}

export interface PatrimonioHistory {
  months: number;
  currency: string | null;
  history: Array<{ month: string; currency: string; value: string }>;
}

export interface PatrimonioAccountTrend {
  months: number;
  currency: string | null;
  accounts: Array<{
    id: string;
    name: string;
    account_type: string;
    currency: string;
    current_balance: string;
    delta: string;
    delta_percent: string | null;
    points: Array<{ month: string; balance: string }>;
  }>;
}

export interface PatrimonioProjection {
  available: boolean;
  reason?: string;
  currency: string | null;
  slope_per_month?: number;
  history: Array<{ month: string; value: string }>;
  projection: Array<{ month: string; value: string; lower: string; upper: string }>;
}

export interface PatrimonioCompare {
  months_ago: number;
  from_month: string;
  to_month: string;
  currency: string | null;
  totals: Array<{ currency: string; from: string; to: string; delta: string; delta_percent: string | null }>;
  top_movers: Array<{ id: string; name: string; currency: string; from: string; to: string; delta: string }>;
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

export interface AnnualReport {
  year: number;
  totals: Array<{ currency: string; income: string; expenses: string; net: string; count: number }>;
  by_month: Array<{ month: string; currency: string; income: string; expenses: string; net: string; count: number }>;
  by_category: Array<{
    category_id: string | null;
    category_name: string;
    currency: string;
    income: string;
    expenses: string;
    net: string;
    count: number;
  }>;
  transaction_count: number;
  uncategorized_count: number;
}

export interface AuditEvent {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface StatementQualityStats {
  statement_count: number;
  transaction_count: number;
  by_parser: Array<{ parser: string; statements: number; transactions: number }>;
  recent: Array<{
    id: string;
    filename: string;
    parser: string | null;
    status: string;
    transactions: number;
    opening_balance: string | null;
    closing_balance: string | null;
    period_start: string | null;
    period_end: string | null;
  }>;
}

export interface StatementQuality {
  uploaded_file_id: string;
  parser: string | null;
  status: string;
  transaction_count: number;
  income_count: number;
  expense_count: number;
  duplicate_count: number;
  uncategorized_count: number;
  internal_transfer_count: number;
  period_start: string | null;
  period_end: string | null;
  opening_balance: string | null;
  closing_balance: string | null;
  warnings: string[];
}

export interface ReconciliationAccount {
  account_id: string;
  account_name: string;
  currency: string;
  account_balance: string;
  movement_balance: string;
  difference: string;
  status: "ok" | "warning";
  transaction_count: number;
  reconciliation_basis: "account" | "statement";
  statement_count: number;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationCount {
  total: number;
  unread: number;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_admin: boolean;
  preferences: Record<string, unknown> | null;
}

export interface AdminUserCreatePayload {
  email: string;
  password: string;
  full_name: string;
  is_active?: boolean;
  is_admin?: boolean;
}

export interface AdminUserUpdatePayload {
  full_name?: string;
  is_active?: boolean;
  is_admin?: boolean;
}

export interface ReconciliationSummary {
  currency: string | null;
  start_date: string | null;
  end_date: string | null;
  accounts: ReconciliationAccount[];
  ok_count: number;
  warning_count: number;
}
