import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Appearance } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import { useUserProfiles } from "@/context/UserContext";
import {
  getProfileSetting,
  setProfileSetting,
  type ThemeMode,
} from "@/services/profileSettingsService";

export type { ThemeMode } from "@/services/profileSettingsService";

type ThemeContextValue = {
  mode: ThemeMode;
  isLoading: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  isLoading: true,
  setMode: async () => {
    throw new Error("ThemeSettingsProvider is not available.");
  },
});

export function useThemeSettings(): ThemeContextValue {
  return useContext(ThemeContext);
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function ThemeSettingsProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const profileId = activeProfile?.id ?? null;
  const [storedMode, setStoredMode] = useState<{
    profileId: string | null;
    mode: ThemeMode;
  }>({ profileId: null, mode: "system" });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profileId) {
      setIsLoading(true);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    void getProfileSetting(database, profileId, "theme_mode")
      .then((value) => {
        if (isCurrent) {
          setStoredMode({
            profileId,
            mode: isThemeMode(value) ? value : "system",
          });
        }
      })
      .catch((error: unknown) => {
        console.error("Could not load appearance preference:", error);
        if (isCurrent) setStoredMode({ profileId, mode: "system" });
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [database, profileId]);

  const mode =
    storedMode.profileId === profileId ? storedMode.mode : "system";

  useEffect(() => {
    Appearance.setColorScheme(mode === "system" ? "auto" : mode);
  }, [mode]);

  const setMode = useCallback(
    async (nextMode: ThemeMode) => {
      if (!profileId) {
        throw new Error("Select a profile before changing appearance.");
      }
      await setProfileSetting(database, profileId, "theme_mode", nextMode);
      setStoredMode({ profileId, mode: nextMode });
    },
    [database, profileId],
  );

  const value = useMemo(
    () => ({ mode, isLoading, setMode }),
    [mode, isLoading, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
