import type { Medicine } from '@/types/medicine';

export interface MedicationService {
  getMedicines(userId: string): Promise<Medicine[]>;
}
