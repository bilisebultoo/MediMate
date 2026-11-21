import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";

export default function UserSelectionScreen() {
  const { profiles, activeProfile, isLoading, switchProfile } =
    useUserProfiles();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const selectProfile = async (profileId: string) => {
    if (switchingId) return;
    setSwitchingId(profileId);
    try {
      await switchProfile(profileId);
      router.replace("/(tabs)/home");
    } catch (error) {
      console.error("Error switching profile:", error);
      Alert.alert("Could not switch profile", "Please try again.");
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Choose a profile</Text>
        <Text style={styles.subtitle}>
          Medicines and health records are kept separate for each person.
        </Text>
        {isLoading ? (
          <Text style={styles.status}>Loading profiles...</Text>
        ) : profiles.length === 0 ? (
          <Text style={styles.status}>No profiles are available.</Text>
        ) : (
          profiles.map((profile) => {
            const isActive = profile.id === activeProfile?.id;
            return (
              <Pressable
                key={profile.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                disabled={switchingId !== null}
                onPress={() => void selectProfile(profile.id)}
                style={[styles.profileCard, isActive && styles.activeCard]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {profile.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.name}>{profile.name}</Text>
                  <Text style={styles.role}>
                    {profile.role === "self" ? "Personal profile" : "Dependent"}
                  </Text>
                </View>
                <Text style={styles.activeLabel}>
                  {switchingId === profile.id
                    ? "Switching..."
                    : isActive
                      ? "Active"
                      : "Select"}
                </Text>
              </Pressable>
            );
          })
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/profile/dependents")}
          style={styles.manageButton}
        >
          <Text style={styles.manageText}>Manage dependents</Text>
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
    padding: 20,
    paddingTop: 36,
  },
  title: {
    color: "#173D35",
    fontSize: 27,
    fontWeight: "700",
  },
  subtitle: {
    color: "#71817C",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    marginTop: 7,
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 14,
  },
  activeCard: {
    borderColor: "#287A65",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#E8F5EE",
    borderRadius: 23,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  avatarText: {
    color: "#287A65",
    fontSize: 18,
    fontWeight: "700",
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
    paddingVertical: 18,
  },
  manageButton: {
    alignItems: "center",
    backgroundColor: "#287A65",
    borderRadius: 12,
    marginTop: 12,
    padding: 15,
  },
  manageText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
