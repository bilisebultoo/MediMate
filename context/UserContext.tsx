import { useSQLiteContext } from "expo-sqlite";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import type { User } from "@/types/user";

export type ProfileInput = Pick<
  User,
  "name" | "email" | "gender" | "dateOfBirth"
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
  createSelfProfile: (input: ProfileInput) => Promise<void>;
  updateProfile: (profileId: string, input: ProfileInput) => Promise<void>;
  addDependent: (input: ProfileInput) => Promise<void>;
  deleteDependent: (profileId: string) => Promise<void>;
};

export const UserContext = createContext<UserContextValue | null>(null);

export function useUserProfiles(): UserContextValue {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error("useUserProfiles must be used within a UserProvider.");
  }

  return context;
}

function createProfileId(): string {
  return `profile-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function UserProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();

  const [profiles, setProfiles] = useState<User[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Always load the owner's profile as the active profile.
  const refreshProfiles = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const profileRecords = await database.getAllAsync<User>(
        `SELECT id, name, email, gender,
                date_of_birth AS dateOfBirth, role
         FROM profiles
         ORDER BY CASE role WHEN 'self' THEN 0 ELSE 1 END, name COLLATE NOCASE`,
      );

      const selfProfile =
        profileRecords.find((profile) => profile.role === "self") ?? null;

      setProfiles(profileRecords);
      setActiveProfileId(selfProfile?.id ?? null);

      if (selfProfile) {
        await database.runAsync(
          `INSERT INTO active_profile (singleton_id, profile_id)
           VALUES (1, ?)
           ON CONFLICT(singleton_id)
           DO UPDATE SET profile_id = excluded.profile_id`,
          selfProfile.id,
        );
      }
    } catch (error) {
      console.error("Error loading profiles:", error);
      setLoadError("Profiles could not be loaded.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [database]);

  useEffect(() => {
    void refreshProfiles().catch((error: unknown) => {
      console.error("Could not initialize profiles:", error);
    });
  }, [refreshProfiles]);

  // Only the account owner's profile can be active.
  const switchProfile = useCallback(
    async (profileId: string) => {
      const profile = await database.getFirstAsync<{
        id: string;
        role: string;
      }>("SELECT id, role FROM profiles WHERE id = ?", profileId);

      if (!profile || profile.role !== "self") {
        throw new Error(
          "You cannot switch to a dependent profile. Dependents are managed from your personal account.",
        );
      }

      await database.runAsync(
        `INSERT INTO active_profile (singleton_id, profile_id)
         VALUES (1, ?)
         ON CONFLICT(singleton_id)
         DO UPDATE SET profile_id = excluded.profile_id`,
        profileId,
      );

      await refreshProfiles();
    },
    [database, refreshProfiles],
  );

  // Create the first owner profile or fill the empty default profile.
  const createSelfProfile = useCallback(
    async (input: ProfileInput) => {
      const name = input.name.trim();
      const email = input.email?.trim() || null;

      if (!name || !email || !input.gender || !input.dateOfBirth) {
        throw new Error("Please complete all required profile information.");
      }

      let targetProfileId = "";

      await database.withTransactionAsync(async () => {
        const existingSelf = await database.getFirstAsync<{
          id: string;
          name: string;
          email: string | null;
          gender: string | null;
          dateOfBirth: string | null;
        }>(
          `SELECT id, name, email, gender,
                  date_of_birth AS dateOfBirth
           FROM profiles
           WHERE role = 'self'
           LIMIT 1`,
        );

        if (existingSelf) {
          const isEmptyDefault =
            (existingSelf.id === "default" ||
              existingSelf.name.trim() === "My Profile") &&
            !existingSelf.email &&
            !existingSelf.gender &&
            !existingSelf.dateOfBirth;

          targetProfileId = existingSelf.id;

          await database.runAsync(
            `UPDATE profiles
             SET name = ?, email = ?, gender = ?, date_of_birth = ?
             WHERE id = ?`,
            name,
            email,
            input.gender,
            input.dateOfBirth,
            targetProfileId,
          );
        } else {
          targetProfileId = createProfileId();

          await database.runAsync(
            `INSERT INTO profiles (
              id, name, email, gender, date_of_birth, role, created_at
            ) VALUES (?, ?, ?, ?, ?, 'self', ?)`,
            targetProfileId,
            name,
            email,
            input.gender,
            input.dateOfBirth,
            new Date().toISOString(),
          );
        }

        await database.runAsync(
          `INSERT INTO active_profile (singleton_id, profile_id)
           VALUES (1, ?)
           ON CONFLICT(singleton_id)
           DO UPDATE SET profile_id = excluded.profile_id`,
          targetProfileId,
        );
      });

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
        throw new Error("The profile could not be found.");
      }

      await refreshProfiles();
    },
    [database, refreshProfiles],
  );

  const addDependent = useCallback(
    async (input: ProfileInput) => {
      if (!input.name.trim()) {
        throw new Error("Please enter the dependent's name.");
      }

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

        if (!dependent || dependent.role !== "dependent") {
          throw new Error("Only dependent profiles can be removed.");
        }

        await database.runAsync(
          "DELETE FROM medication_history WHERE user_id = ?",
          profileId,
        );

        await database.runAsync(
          "DELETE FROM medicines WHERE user_id = ?",
          profileId,
        );

        await database.runAsync(
          "DELETE FROM health_records WHERE user_id = ?",
          profileId,
        );

        await database.runAsync(
          "DELETE FROM appointments WHERE user_id = ?",
          profileId,
        );

        await database.runAsync(
          "DELETE FROM meal_settings WHERE user_id = ?",
          profileId,
        );

        await database.runAsync("DELETE FROM profiles WHERE id = ?", profileId);
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
      createSelfProfile,
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
      createSelfProfile,
      updateProfile,
      addDependent,
      deleteDependent,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
