import type { SQLiteDatabase } from "expo-sqlite";

import type { Contact, ContactInput, ContactType } from "@/types/contact";

const CONTACT_COLUMNS = `
  id, user_id AS userId, type, name, specialty, relationship,
  phone, email, address, notes
`;

export function getContacts(
  database: SQLiteDatabase,
  userId: string,
  search = "",
  type?: ContactType,
): Promise<Contact[]> {
  const conditions = ["user_id = ?"];
  const parameters: string[] = [userId];

  if (type) {
    conditions.push("type = ?");
    parameters.push(type);
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    const pattern = `%${trimmedSearch}%`;
    conditions.push(`(
      name LIKE ? COLLATE NOCASE OR specialty LIKE ? COLLATE NOCASE
      OR relationship LIKE ? COLLATE NOCASE OR phone LIKE ? COLLATE NOCASE
      OR email LIKE ? COLLATE NOCASE OR address LIKE ? COLLATE NOCASE
      OR notes LIKE ? COLLATE NOCASE
    )`);
    parameters.push(...Array(7).fill(pattern));
  }

  return database.getAllAsync<Contact>(
    `SELECT ${CONTACT_COLUMNS}
     FROM contacts
     WHERE ${conditions.join(" AND ")}
     ORDER BY name COLLATE NOCASE, id`,
    ...parameters,
  );
}

export function getContact(
  database: SQLiteDatabase,
  contactId: number,
  userId: string,
): Promise<Contact | null> {
  return database.getFirstAsync<Contact>(
    `SELECT ${CONTACT_COLUMNS}
     FROM contacts
     WHERE id = ? AND user_id = ?`,
    contactId,
    userId,
  );
}

export async function createContact(
  database: SQLiteDatabase,
  userId: string,
  contact: ContactInput,
): Promise<void> {
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO contacts (
      user_id, type, name, specialty, relationship, phone,
      email, address, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    contact.type,
    contact.name,
    contact.specialty,
    contact.relationship,
    contact.phone,
    contact.email,
    contact.address,
    contact.notes,
    now,
    now,
  );
}

export async function updateContact(
  database: SQLiteDatabase,
  contactId: number,
  userId: string,
  contact: ContactInput,
): Promise<void> {
  const result = await database.runAsync(
    `UPDATE contacts
     SET type = ?, name = ?, specialty = ?, relationship = ?, phone = ?,
         email = ?, address = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    contact.type,
    contact.name,
    contact.specialty,
    contact.relationship,
    contact.phone,
    contact.email,
    contact.address,
    contact.notes,
    new Date().toISOString(),
    contactId,
    userId,
  );
  if (result.changes !== 1) {
    throw new Error("The contact could not be found.");
  }
}

export async function deleteContact(
  database: SQLiteDatabase,
  contactId: number,
  userId: string,
): Promise<void> {
  const result = await database.runAsync(
    "DELETE FROM contacts WHERE id = ? AND user_id = ?",
    contactId,
    userId,
  );
  if (result.changes !== 1) {
    throw new Error("The contact could not be found.");
  }
}
