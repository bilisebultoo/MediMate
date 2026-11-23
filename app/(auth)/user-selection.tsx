import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";

export default function UserSelectionScreen() {
  const { profiles, isLoading } = useUserProfiles();

  const ownerProfile =
    profiles.find((profile) => profile.role === "self") ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>👨‍👩‍👧‍👦</Text>
        </View>

        <Text style={styles.title}>Your MediMate Account</Text>

        <Text style={styles.subtitle}>
          MediMate uses one personal account owner. You can add dependents under
          your account and manage their health information separately.
        </Text>

        {isLoading ? (
          <Text style={styles.status}>Loading account...</Text>
        ) : ownerProfile ? (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {ownerProfile.name.trim().charAt(0).toUpperCase() || "?"}
              </Text>
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.name}>{ownerProfile.name}</Text>
              <Text style={styles.role}>Personal account owner</Text>
            </View>

            <Text style={styles.activeLabel}>Owner</Text>
          </View>
        ) : (
          <Text style={styles.status}>
            No personal account has been created yet.
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/profile/dependents")}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Manage Dependents</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/(auth)/login")}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Back to Login</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F7FAF9",
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 22,
  },
  iconCircle: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#D9EEE5",
    borderRadius: 38,
    height: 76,
    justifyContent: "center",
    marginBottom: 20,
    width: 76,
  },
  icon: {
    fontSize: 34,
  },
  title: {
    color: "#173D35",
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "#71817C",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 25,
    marginTop: 10,
    textAlign: "center",
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 20,
    padding: 16,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#E8F5EE",
    borderRadius: 25,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  avatarText: {
    color: "#287A65",
    fontSize: 20,
    fontWeight: "800",
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    color: "#243B35",
    fontSize: 15,
    fontWeight: "700",
  },
  role: {
    color: "#71817C",
    fontSize: 12,
    marginTop: 4,
  },
  activeLabel: {
    color: "#287A65",
    fontSize: 12,
    fontWeight: "700",
  },
  status: {
    color: "#71817C",
    fontSize: 14,
    marginBottom: 20,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#287A65",
    borderRadius: 13,
    marginTop: 10,
    padding: 16,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#DDE7E2",
    borderRadius: 13,
    borderWidth: 1,
    marginTop: 12,
    padding: 15,
  },
  secondaryButtonText: {
    color: "#287A65",
    fontSize: 14,
    fontWeight: "700",
  },
});
