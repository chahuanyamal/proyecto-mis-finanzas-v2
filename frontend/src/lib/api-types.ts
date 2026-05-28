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
