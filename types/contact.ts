export type ContactType = "doctor" | "facility" | "emergency";

export interface Contact {
  id: number;
  userId: string;
  type: ContactType;
  name: string;
  specialty: string | null;
  relationship: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export type ContactInput = Omit<Contact, "id" | "userId">;
