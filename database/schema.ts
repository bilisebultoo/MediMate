export const DATABASE_TABLES = [
  'users',
  'medicines',
  'healthRecords',
  'appointments',
  'notifications',
] as const;

export type DatabaseTable = (typeof DATABASE_TABLES)[number];
