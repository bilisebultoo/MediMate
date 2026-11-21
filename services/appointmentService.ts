import type { Appointment } from '@/types/appointment';
import type { SQLiteDatabase } from 'expo-sqlite';

export type AppointmentInput = Pick<
  Appointment,
  'title' | 'scheduledDate' | 'scheduledTime' | 'location' | 'reminderMinutes'
>;

const APPOINTMENT_COLUMNS = `
  id,
  user_id AS userId,
  title,
  scheduled_date AS scheduledDate,
  scheduled_time AS scheduledTime,
  location,
  reminder_minutes AS reminderMinutes
`;

export async function getAppointmentsForMonth(
  database: SQLiteDatabase,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<Appointment[]> {
  return database.getAllAsync<Appointment>(
    `SELECT ${APPOINTMENT_COLUMNS}
     FROM appointments
     WHERE user_id = ? AND scheduled_date BETWEEN ? AND ?
     ORDER BY scheduled_date, scheduled_time, id`,
    userId,
    startDate,
    endDate,
  );
}

export async function getUpcomingAppointments(
  database: SQLiteDatabase,
  userId: string,
  today: string,
  currentTime: string,
  limit = 4,
): Promise<Appointment[]> {
  return database.getAllAsync<Appointment>(
    `SELECT ${APPOINTMENT_COLUMNS}
     FROM appointments
     WHERE user_id = ?
       AND (
         scheduled_date > ?
         OR (scheduled_date = ? AND scheduled_time >= ?)
       )
     ORDER BY scheduled_date, scheduled_time, id
     LIMIT ?`,
    userId,
    today,
    today,
    currentTime,
    Math.max(1, Math.floor(limit)),
  );
}

export async function addAppointment(
  database: SQLiteDatabase,
  userId: string,
  appointment: AppointmentInput,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO appointments (
       user_id, title, scheduled_date, scheduled_time, location, reminder_minutes, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    userId,
    appointment.title,
    appointment.scheduledDate,
    appointment.scheduledTime,
    appointment.location,
    appointment.reminderMinutes,
    new Date().toISOString(),
  );
}

export async function updateAppointment(
  database: SQLiteDatabase,
  userId: string,
  appointmentId: number,
  appointment: AppointmentInput,
): Promise<boolean> {
  const result = await database.runAsync(
    `UPDATE appointments
     SET title = ?, scheduled_date = ?, scheduled_time = ?, location = ?, reminder_minutes = ?
     WHERE id = ? AND user_id = ?`,
    appointment.title,
    appointment.scheduledDate,
    appointment.scheduledTime,
    appointment.location,
    appointment.reminderMinutes,
    appointmentId,
    userId,
  );
  return result.changes === 1;
}

export async function deleteAppointment(
  database: SQLiteDatabase,
  userId: string,
  appointmentId: number,
): Promise<boolean> {
  const result = await database.runAsync(
    'DELETE FROM appointments WHERE id = ? AND user_id = ?',
    appointmentId,
    userId,
  );
  return result.changes === 1;
}
