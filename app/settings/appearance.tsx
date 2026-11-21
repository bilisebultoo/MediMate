import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useThemeSettings,
  type ThemeMode,
} from "@/context/ThemeContext";
import { useTheme } from "@/hooks/use-theme";

const THEME_OPTIONS: {
  value: ThemeMode;
  title: string;
  description: string;
}[] = [
  {
    value: "system",
    title: "System",
    description: "Follow the appearance setting on this device.",
  },
  {
    value: "light",
    title: "Light",
    description: "Use the light appearance in MediMate.",
  },
  {
    value: "dark",
    title: "Dark",
    description: "Use the dark appearance in MediMate.",
  },
];

export default function AppearanceSettingsScreen() {
  const { mode, isLoading, setMode } = useThemeSettings();
  const colors = useTheme();
  const [saving, setSaving] = useState(false);

  const selectMode = async (value: ThemeMode) => {
    if (saving || value === mode) return;
    setSaving(true);
    try {
      await setMode(value);
    } catch (error) {
      console.error("Could not save appearance setting:", error);
      Alert.alert("Could not change appearance", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your choice is saved for the active profile and applies throughout
          MediMate.
        </Text>

        {THEME_OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: saving }}
              disabled={isLoading || saving}
              onPress={() => void selectMode(option.value)}
              style={[
                styles.option,
                {
                  backgroundColor: colors.backgroundElement,
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  {option.title}
                </Text>
                <Text
                  style={[
                    styles.optionDescription,
                    { color: colors.textSecondary },
                  ]}
                >
                  {option.description}
                </Text>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  { borderColor: selected ? colors.accent : colors.textSecondary },
                ]}
              >
                {selected ? (
                  <View
                    style={[
                      styles.radioInner,
                      { backgroundColor: colors.accent },
                    ]}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    marginTop: 6,
  },
  option: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 12,
    padding: 16,
  },
  optionText: {
    flex: 1,
    paddingRight: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  optionDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  radioOuter: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  radioInner: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
});
