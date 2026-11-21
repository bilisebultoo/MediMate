import type { User } from '@/types/user';

export interface UserService {
  getUser(userId: string): Promise<User | null>;
}
