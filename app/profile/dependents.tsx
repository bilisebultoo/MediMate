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
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";
import { refreshAppointmentNotifications } from "@/services/appointmentNotifications";
import { refreshMedicationDoseNotifications } from "@/services/medicationDoseNotifications";
import { useTheme } from "@/hooks/use-theme";

export default function DependentsScreen() {
  const database = useSQLiteContext();
  const { profiles, activeProfile, deleteDependent } = useUserProfiles();
  const colors = useTheme();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dependents = profiles.filter((profile) => profile.role === "dependent");

  const confirmDelete = (profileId: string, name: string) => {
    Alert.alert(
      "Remove dependent?",
      `Removing ${name} will also delete their medicines, appointments, and health records from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setDeletingId(profileId);
            try {
              await deleteDependent(profileId);
              try {
                await Promise.all([
                  refreshMedicationDoseNotifications(database),
                  refreshAppointmentNotifications(database),
                ]);
              } catch (error) {
                console.error(
                  "Dependent removed, but reminders could not be refreshed:",
                  error,
                );
                Alert.alert(
                  "Dependent removed",
                  "Their information was deleted, but scheduled reminders could not be refreshed.",
                );
              }
            } catch (error) {
              console.error("Error removing dependent profile:", error);
              Alert.alert("Could not remove dependent", "Please try again.");
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Dependents</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Manage family profiles and their separate health information.
        </Text>

        {dependents.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No dependents yet
            </Text>
            <Text
              style={[styles.emptyDescription, { color: colors.textSecondary }]}
            >
              Add a family member to manage their information separately.
            </Text>
          </View>
        ) : (
          dependents.map((dependent) => (
            <View
              key={dependent.id}
              style={[
                styles.profileCard,
                {
                  backgroundColor: colors.backgroundElement,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.profileInfo}>
                <Text style={[styles.name, { color: colors.text }]}>
                  {dependent.name}
                </Text>
                <Text style={[styles.email, { color: colors.textSecondary }]}>
                  {dependent.email || "Email not set"}
                  {activeProfile?.id === dependent.id ? " · Active" : ""}
                </Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/profile/edit-profile",
                      params: { id: dependent.id },
                    })
                  }
                  style={styles.actionButton}
                >
                  <Text style={[styles.editText, { color: colors.accent }]}>
                    Edit
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={deletingId === dependent.id}
                  onPress={() => confirmDelete(dependent.id, dependent.name)}
                  style={styles.actionButton}
                >
                  <Text style={[styles.deleteText, { color: colors.danger }]}>
                    {deletingId === dependent.id ? "Removing..." : "Remove"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/profile/edit-profile",
              params: { role: "dependent" },
            })
          }
          style={styles.addButton}
        >
          <Text style={styles.addText}>＋ Add dependent</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(auth)/user-selection")}
          style={[
            styles.switchButton,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.switchText, { color: colors.accent }]}>
            Switch profile
          </Text>
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
    paddingBottom: 36,
  },
  title: {
    color: "#173D35",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#71817C",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    marginTop: 6,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  emptyTitle: {
    color: "#243B35",
    fontSize: 16,
    fontWeight: "700",
  },
  emptyDescription: {
    color: "#71817C",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: "center",
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
  profileInfo: {
    flex: 1,
  },
  name: {
    color: "#243B35",
    fontSize: 16,
    fontWeight: "700",
  },
  email: {
    color: "#71817C",
    fontSize: 13,
    marginTop: 4,
  },
  actions: {
    alignItems: "flex-end",
  },
  actionButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  editText: {
    color: "#287A65",
    fontSize: 13,
    fontWeight: "700",
  },
  deleteText: {
    color: "#B04444",
    fontSize: 13,
    fontWeight: "700",
  },
  addButton: {
    alignItems: "center",
    backgroundColor: "#287A65",
    borderRadius: 12,
    marginTop: 12,
    padding: 15,
  },
  addText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  switchButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
  },
  switchText: {
    color: "#287A65",
    fontWeight: "700",
  },
});
