import type { AppNotification } from '@/types/notification';

export interface NotificationService {
  getNotifications(userId: string): Promise<AppNotification[]>;
}
