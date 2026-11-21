import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";

const SETTINGS_OPTIONS = [
  {
    title: "Notifications",
    description: "Choose which reminders you receive",
    path: "/settings/notifications",
  },
  {
    title: "Security",
    description: "Manage your app lock and device authentication",
    path: "/settings/security",
  },
  {
    title: "Appearance",
    description: "Use light, dark, or system theme",
    path: "/settings/appearance",
  },
  {
    title: "Meal times",
    description: "Set your breakfast, lunch, and dinner times",
    path: "/settings/meal-times",
  },
  {
    title: "Health reminders",
    description: "Schedule reminders to measure health metrics",
    path: "/health/health-reminders",
  },
  {
    title: "Privacy & security",
    description: "Learn how MediMate stores your information",
    path: "/settings/privacy-policy",
  },
  {
    title: "Feedback",
    description: "Share a suggestion or report a problem",
    path: "/settings/feedback",
  },
  {
    title: "About MediMate",
    description: "View app information and medical disclaimer",
    path: "/settings/about",
  },
  {
    title: "Medical disclaimer",
    description: "Understand the limits of health information",
    path: "/settings/medical-disclaimer",
  },
] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useTheme();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        {SETTINGS_OPTIONS.map((option) => (
          <Pressable
            key={option.path}
            accessibilityRole="button"
            onPress={() => router.push(option.path)}
            style={[
              styles.card,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {option.title}
              </Text>
              <Text
                style={[styles.description, { color: colors.textSecondary }]}
              >
                {option.description}
              </Text>
            </View>
            <Text style={[styles.arrow, { color: colors.accent }]}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    fontSize: 25,
    fontWeight: "bold",
    marginBottom: 25,
  },
  card: {
    padding: 18,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  description: {
    fontSize: 13,
    marginTop: 6,
  },
  arrow: {
    fontSize: 28,
    marginLeft: 12,
  },
});
