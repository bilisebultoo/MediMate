import { useRouter } from "expo-router";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const colors = useTheme();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Security</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/settings/security/app-lock")}
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
              App Lock
            </Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Manage your PIN, biometrics, and automatic locking.
            </Text>
          </View>
          <Text style={[styles.arrow, { color: colors.accent }]}>›</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { fontSize: 25, fontWeight: "bold", marginBottom: 25 },
  card: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: "600" },
  description: { fontSize: 13, marginTop: 6 },
  arrow: { fontSize: 28, marginLeft: 12 },
});
