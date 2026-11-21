export interface Appointment {
  id: number;
  userId: string;
  title: string;
  scheduledDate: string;
  scheduledTime: string;
  location: string;
  reminderMinutes: number;
}
