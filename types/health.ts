export type HealthMetric =
  | 'blood_pressure'
  | 'heart_rate'
  | 'blood_sugar'
  | 'weight'
  | 'temperature'
  | 'custom';

export interface HealthRecord {
  id: number;
  metric: HealthMetric;
  name: string;
  value: string;
  unit: string;
  recorded_at: string;
  notes: string | null;
}
