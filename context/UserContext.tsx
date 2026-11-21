import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import type { User } from '@/types/user';

export type ProfileInput = Pick<
  User,
  'name' | 'email' | 'gender' | 'dateOfBirth'
>;

type ActiveProfileRecord = {
  profile_id: string;
};

type UserContextValue = {
  profiles: User[];
  activeProfile: User | null;
  isLoading: boolean;
  loadError: string | null;
  refreshProfiles: () => Promise<void>;
  switchProfile: (profileId: string) => Promise<void>;
  updateProfile: (profileId: string, input: ProfileInput) => Promise<void>;
  addDependent: (input: ProfileInput) => Promise<void>;
  deleteDependent: (profileId: string) => Promise<void>;
};

export const UserContext = createContext<UserContextValue | null>(null);

export function useUserProfiles(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUserProfiles must be used within a UserProvider.');
  }
  return context;
}

function createProfileId(): string {
  return `dependent-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function UserProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const [profiles, setProfiles] = useState<User[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshProfiles = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [profileRecords, activeRecord] = await Promise.all([
        database.getAllAsync<User>(
          `SELECT id, name, email, gender,
                  date_of_birth AS dateOfBirth, role
           FROM profiles
           ORDER BY CASE role WHEN 'self' THEN 0 ELSE 1 END, name COLLATE NOCASE`,
        ),
        database.getFirstAsync<ActiveProfileRecord>(
          "SELECT profile_id FROM active_profile WHERE singleton_id = 1",
        ),
      ]);
      const selectedId =
        activeRecord?.profile_id ??
        profileRecords.find((profile) => profile.role === 'self')?.id ??
        null;
      setProfiles(profileRecords);
      setActiveProfileId(selectedId);
      if (selectedId && !activeRecord) {
        await database.runAsync(
          `INSERT OR REPLACE INTO active_profile (singleton_id, profile_id)
           VALUES (1, ?)`,
          selectedId,
        );
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
      setLoadError('Profiles could not be loaded.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [database]);

  useEffect(() => {
    void refreshProfiles().catch((error: unknown) => {
      console.error('Could not initialize profiles:', error);
    });
  }, [refreshProfiles]);

  const switchProfile = useCallback(
    async (profileId: string) => {
      await database.runAsync(
        `INSERT INTO active_profile (singleton_id, profile_id)
         VALUES (1, ?)
         ON CONFLICT(singleton_id) DO UPDATE SET profile_id = excluded.profile_id`,
        profileId,
      );
      await refreshProfiles();
    },
    [database, refreshProfiles],
  );

  const updateProfile = useCallback(
    async (profileId: string, input: ProfileInput) => {
      const result = await database.runAsync(
        `UPDATE profiles
         SET name = ?, email = ?, gender = ?, date_of_birth = ?
         WHERE id = ?`,
        input.name.trim(),
        input.email?.trim() || null,
        input.gender || null,
        input.dateOfBirth || null,
        profileId,
      );
      if (result.changes !== 1) {
        throw new Error('The profile could not be found.');
      }
      await refreshProfiles();
    },
    [database, refreshProfiles],
  );

  const addDependent = useCallback(
    async (input: ProfileInput) => {
      await database.runAsync(
        `INSERT INTO profiles (
          id, name, email, gender, date_of_birth, role, created_at
        ) VALUES (?, ?, ?, ?, ?, 'dependent', ?)`,
        createProfileId(),
        input.name.trim(),
        input.email?.trim() || null,
        input.gender || null,
        input.dateOfBirth || null,
        new Date().toISOString(),
      );
      await refreshProfiles();
    },
    [database, refreshProfiles],
  );

  const deleteDependent = useCallback(
    async (profileId: string) => {
      await database.withTransactionAsync(async () => {
        const dependent = await database.getFirstAsync<{ role: string }>(
          "SELECT role FROM profiles WHERE id = ?",
          profileId,
        );
        if (!dependent || dependent.role !== 'dependent') {
          throw new Error('Only dependent profiles can be removed.');
        }

        const activeRecord = await database.getFirstAsync<ActiveProfileRecord>(
          "SELECT profile_id FROM active_profile WHERE singleton_id = 1",
        );
        if (activeRecord?.profile_id === profileId) {
          const selfProfile = await database.getFirstAsync<{ id: string }>(
            "SELECT id FROM profiles WHERE role = 'self' LIMIT 1",
          );
          if (!selfProfile) {
            throw new Error('The owner profile could not be found.');
          }
          await database.runAsync(
            "UPDATE active_profile SET profile_id = ? WHERE singleton_id = 1",
            selfProfile.id,
          );
        }

        await database.runAsync(
          'DELETE FROM medication_history WHERE user_id = ?',
          profileId,
        );
        await database.runAsync(
          'DELETE FROM medicines WHERE user_id = ?',
          profileId,
        );
        await database.runAsync(
          'DELETE FROM health_records WHERE user_id = ?',
          profileId,
        );
        await database.runAsync(
          'DELETE FROM appointments WHERE user_id = ?',
          profileId,
        );
        await database.runAsync(
          'DELETE FROM meal_settings WHERE user_id = ?',
          profileId,
        );
        await database.runAsync('DELETE FROM profiles WHERE id = ?', profileId);
      });
      await refreshProfiles();
    },
    [database, refreshProfiles],
  );

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const value = useMemo(
    () => ({
      profiles,
      activeProfile,
      isLoading,
      loadError,
      refreshProfiles,
      switchProfile,
      updateProfile,
      addDependent,
      deleteDependent,
    }),
    [
      profiles,
      activeProfile,
      isLoading,
      loadError,
      refreshProfiles,
      switchProfile,
      updateProfile,
      addDependent,
      deleteDependent,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
