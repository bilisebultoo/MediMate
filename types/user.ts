export type UserRole = 'self' | 'dependent';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
}
