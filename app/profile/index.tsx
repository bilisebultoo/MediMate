import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";

function formatDateOfBirth(value: string | null): string {
  if (!value) return "Not set";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
}

export default function ProfileScreen() {
  const { profiles, activeProfile, isLoading, loadError } = useUserProfiles();
  const colors = useTheme();
  const selfProfile = profiles.find((profile) => profile.role === "self") ?? null;
  const initials = useMemo(
    () =>
      selfProfile?.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "?",
    [selfProfile?.name],
  );

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          Loading profile...
        </Text>
      </SafeAreaView>
    );
  }

  if (!selfProfile || loadError) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          {loadError ?? "The personal profile could not be found."}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>My Profile</Text>
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={[styles.name, { color: colors.text }]}>
            {selfProfile.name}
          </Text>
          <Text style={[styles.role, { color: colors.textSecondary }]}>
            Personal profile
          </Text>
        </View>

        <View
          style={[
            styles.detailsCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <ProfileRow label="Email" value={selfProfile.email || "Not set"} />
          <ProfileRow label="Gender" value={selfProfile.gender || "Not set"} />
          <ProfileRow
            label="Date of birth"
            value={formatDateOfBirth(selfProfile.dateOfBirth)}
          />
          <ProfileRow
            label="Active profile"
            value={activeProfile?.name ?? "Not set"}
          />
        </View>

        <ActionButton
          title="Edit profile"
          onPress={() =>
            router.push({
              pathname: "/profile/edit-profile",
              params: { id: selfProfile.id },
            })
          }
        />
        <ActionButton
          title="Manage dependents"
          onPress={() => router.push("/profile/dependents")}
          secondary
        />
        <ActionButton
          title="Switch profile"
          onPress={() => router.push("/(auth)/user-selection")}
          secondary
        />
        <ActionButton
          title="Switch User / Log In Screen"
          onPress={() => router.push("/(auth)/login")}
          secondary
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  const colors = useTheme();
  return (
    <View style={styles.profileRow}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function ActionButton({
  title,
  onPress,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.actionButton,
        secondary && styles.secondaryButton,
        secondary && {
          backgroundColor: colors.backgroundElement,
          borderColor: colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.actionText,
          secondary && styles.secondaryText,
          secondary && { color: colors.accent },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F7FAF9",
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    color: "#173D35",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 20,
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 24,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#D9EEE5",
    borderRadius: 34,
    height: 68,
    justifyContent: "center",
    marginBottom: 12,
    width: 68,
  },
  avatarText: {
    color: "#247A65",
    fontSize: 24,
    fontWeight: "700",
  },
  name: {
    color: "#173D35",
    fontSize: 20,
    fontWeight: "700",
  },
  role: {
    color: "#71817C",
    fontSize: 14,
    marginTop: 5,
  },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  profileRow: {
    borderBottomColor: "#EDF1EF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  rowLabel: {
    color: "#71817C",
    fontSize: 13,
  },
  rowValue: {
    color: "#243B35",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: "#287A65",
    borderRadius: 12,
    marginTop: 10,
    padding: 15,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderWidth: 1,
  },
  secondaryText: {
    color: "#287A65",
  },
  message: {
    color: "#71817C",
    fontSize: 15,
    padding: 24,
    textAlign: "center",
  },
});
