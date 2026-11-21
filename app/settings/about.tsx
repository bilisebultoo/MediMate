import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { APP_NAME } from "@/constants/config";
import { useTheme } from "@/hooks/use-theme";

export default function AboutScreen() {
  const colors = useTheme();
  const version = Constants.expoConfig?.version ?? "Unavailable";

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.appCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.appName, { color: colors.text }]}>
            {APP_NAME}
          </Text>
          <Text style={[styles.version, { color: colors.textSecondary }]}>
            Version {version}
          </Text>
        </View>

        <Text style={[styles.heading, { color: colors.text }]}>
          About MediMate
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          MediMate helps people organize medication schedules, appointments,
          health measurements, and important healthcare contacts for each
          profile on one device.
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          MediMate is an organizational tool. It does not diagnose conditions,
          prescribe treatment, or replace advice from a qualified healthcare
          professional.
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/settings/medical-disclaimer")}
          style={[
            styles.linkCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.linkText, { color: colors.accent }]}>
            Read the medical disclaimer
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/settings/privacy-policy")}
          style={[
            styles.linkCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.linkText, { color: colors.accent }]}>
            Privacy & security
          </Text>
        </Pressable>
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
  appCard: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 24,
    padding: 24,
  },
  appName: {
    fontSize: 24,
    fontWeight: "700",
  },
  version: {
    fontSize: 13,
    marginTop: 6,
  },
  heading: {
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  linkCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 15,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
