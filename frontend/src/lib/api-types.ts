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
  account: Account | null;
  category: Category | null;
}

export interface TransactionPayload {
  account_id: string;
  category_id?: string | null;
  date: string;
  description: string;
  amount: string;
  currency: string;
  movement_type: Transaction["movement_type"];
}
