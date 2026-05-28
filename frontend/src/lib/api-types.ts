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
