import { useCallback, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { refreshMedicationDoseNotifications } from "@/services/medicationDoseNotifications";
import { useUserProfiles } from "@/context/UserContext";

type Medicine = {
  id: number;
  name: string;
  medicine_form: string;
  dose: string;
  frequency: string;
  schedule_method: string;
  meal?: string | null;
  meal_timing?: string | null;
  meal_offset_minutes?: number | null;
  fixed_times?: string | null;
  interval_value?: string | number | null;
  start_time?: string | null;
  start_date: string;
  end_date: string | null;
  instructions?: string | null;
  status: string;
};

export default function MedicationDetailsScreen() {
  const router = useRouter();
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();

  const { id } = useLocalSearchParams<{ id: string }>();

  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Load medicine whenever this screen becomes active.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadMedicine() {
        if (!activeProfile) return;
        setLoading(true);
        setError("");

        try {
          const medicineId = Number(id);

          if (!Number.isInteger(medicineId) || medicineId <= 0) {
            if (isActive) {
              setError("Invalid medicine ID.");
              setMedicine(null);
            }
            return;
          }

          const record = await database.getFirstAsync<Medicine>(
            "SELECT * FROM medicines WHERE id = ? AND user_id = ?",
            medicineId,
            activeProfile.id,
          );

          if (isActive) {
            if (record) {
              setMedicine(record);
            } else {
              setMedicine(null);
              setError("Medicine not found.");
            }
          }
        } catch (err) {
          console.error("Error loading medicine details:", err);

          if (isActive) {
            setMedicine(null);
            setError("Unable to load medicine details.");
          }
        } finally {
          if (isActive) {
            setLoading(false);
          }
        }
      }

      loadMedicine();

      return () => {
        isActive = false;
      };
    }, [activeProfile, database, id]),
  );

  // Delete medicine after confirmation.
  const handleDeleteMedicine = () => {
    if (!medicine || isDeleting) return;

    Alert.alert(
      "Delete Medicine",
      `Are you sure you want to delete ${medicine.name}? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeleting(true);

              if (!activeProfile) {
                throw new Error("No active profile is selected.");
              }
              await database.runAsync(
                "DELETE FROM medicines WHERE id = ? AND user_id = ?",
                medicine.id,
                activeProfile.id,
              );

              try {
                await refreshMedicationDoseNotifications(database);
              } catch (scheduleError) {
                console.error(
                  "Error removing deleted medicine reminders:",
                  scheduleError,
                );
                Alert.alert(
                  "Medicine deleted, reminder cleanup failed",
                  "The medicine was deleted, but its scheduled reminders could not be refreshed.",
                  [
                    {
                      text: "OK",
                      onPress: () => router.replace("/(tabs)/medication"),
                    },
                  ],
                );
                return;
              }

              Alert.alert(
                "Medicine Deleted",
                `${medicine.name} has been deleted successfully.`,
                [
                  {
                    text: "OK",
                    onPress: () => router.replace("/(tabs)/medication"),
                  },
                ],
              );
            } catch (err) {
              console.error("Error deleting medicine:", err);

              Alert.alert(
                "Delete Failed",
                "Unable to delete this medicine. Please try again.",
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  const showValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === "") {
      return "Not specified";
    }

    return String(value);
  };

  const formatTimes = (times?: string | null) => {
    if (!times) return "Not specified";

    return times
      .split(",")
      .map((time) => time.trim())
      .filter(Boolean)
      .join(", ");
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#287A65" />
          <Text style={styles.loadingText}>Loading medicine details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !medicine) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>💊</Text>

          <Text style={styles.errorTitle}>Medicine unavailable</Text>

          <Text style={styles.errorText}>
            {error || "This medicine could not be found."}
          </Text>

          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}

        <View style={styles.header}>
          <Pressable
            style={styles.backIconButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Medicine Details</Text>

          <View style={styles.headerPlaceholder} />
        </View>

        {/* Medicine Information */}

        <View style={styles.medicineCard}>
          <View style={styles.medicineIconContainer}>
            <Text style={styles.medicineIcon}>💊</Text>
          </View>

          <Text style={styles.medicineName}>{medicine.name}</Text>

          <Text style={styles.medicineForm}>
            {showValue(medicine.medicine_form)}
          </Text>

          <View
            style={[
              styles.statusBadge,
              medicine.status === "ACTIVE"
                ? styles.activeBadge
                : styles.completedBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                medicine.status === "ACTIVE"
                  ? styles.activeText
                  : styles.completedText,
              ]}
            >
              {showValue(medicine.status)}
            </Text>
          </View>
        </View>

        {/* Medicine Information */}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Medicine Information</Text>

          <DetailRow label="Medicine name" value={medicine.name} />

          <DetailRow
            label="Medicine form"
            value={showValue(medicine.medicine_form)}
          />

          <DetailRow label="Prescribed dose" value={medicine.dose} />

          <DetailRow label="Frequency" value={medicine.frequency} />
        </View>

        {/* Schedule Information */}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Schedule Information</Text>

          <DetailRow
            label="Schedule method"
            value={showValue(medicine.schedule_method)}
          />

          {medicine.schedule_method === "Meal-based" && (
            <>
              <DetailRow label="Meal" value={showValue(medicine.meal)} />

              <DetailRow
                label="Reminder timing"
                value={`${medicine.meal_offset_minutes ?? 30} minutes ${
                  medicine.meal_timing?.toLowerCase() ?? "before"
                }`}
              />
            </>
          )}

          {medicine.schedule_method === "Fixed times" && (
            <DetailRow
              label="Reminder times"
              value={formatTimes(medicine.fixed_times)}
            />
          )}

          {medicine.schedule_method === "Interval-based" && (
            <DetailRow
              label="Interval"
              value={showValue(medicine.interval_value)}
            />
          )}

          {medicine.start_time && (
            <DetailRow label="Start time" value={medicine.start_time} />
          )}
        </View>

        {/* Treatment Duration */}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Treatment Duration</Text>

          <DetailRow label="Start date" value={medicine.start_date} />

          <DetailRow label="End date" value={showValue(medicine.end_date)} />
        </View>

        {/* Additional Instructions */}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Additional Instructions</Text>

          <Text style={styles.instructionsText}>
            {medicine.instructions?.trim() ||
              "No additional instructions provided."}
          </Text>
        </View>

        {/* Edit Medicine Button */}

        <Pressable
          style={styles.editMedicineButton}
          onPress={() =>
            router.push(`/medication/add-medicine?id=${medicine.id}`)
          }
          disabled={isDeleting}
        >
          <Text style={styles.editMedicineButtonText}>✎ Edit Medicine</Text>
        </Pressable>

        {/* Delete Medicine Button */}

        <Pressable
          style={[
            styles.deleteMedicineButton,
            isDeleting && styles.disabledButton,
          ]}
          onPress={handleDeleteMedicine}
          disabled={isDeleting}
        >
          <Text style={styles.deleteMedicineButtonText}>
            {isDeleting ? "Deleting..." : "Delete Medicine"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>

      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7FAF9",
  },

  content: {
    padding: 20,
    paddingBottom: 35,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 25,
  },

  backIconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },

  backIcon: {
    fontSize: 32,
    color: "#173D35",
    marginTop: -4,
  },

  headerTitle: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#173D35",
  },

  headerPlaceholder: {
    width: 42,
  },

  medicineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 25,
    alignItems: "center",
    marginBottom: 20,
  },

  medicineIconContainer: {
    width: 75,
    height: 75,
    borderRadius: 22,
    backgroundColor: "#E8F5EE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  medicineIcon: {
    fontSize: 38,
  },

  medicineName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#173D35",
    textAlign: "center",
  },

  medicineForm: {
    fontSize: 14,
    color: "#82918D",
    marginTop: 7,
  },

  statusBadge: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 15,
  },

  activeBadge: {
    backgroundColor: "#E5F3EB",
  },

  completedBadge: {
    backgroundColor: "#EEF0F2",
  },

  statusText: {
    fontSize: 12,
    fontWeight: "bold",
  },

  activeText: {
    color: "#287A65",
  },

  completedText: {
    color: "#64748B",
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#173D35",
    marginBottom: 15,
  },

  detailRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1EF",
    paddingVertical: 12,
    gap: 5,
  },

  detailLabel: {
    fontSize: 12,
    color: "#82918D",
  },

  detailValue: {
    fontSize: 14,
    color: "#263F38",
    fontWeight: "600",
  },

  instructionsText: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 22,
  },

  editMedicineButton: {
    backgroundColor: "#287A65",
    padding: 17,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 10,
  },

  editMedicineButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },

  deleteMedicineButton: {
    backgroundColor: "#FCE8E8",
    padding: 17,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#F2CACA",
  },

  deleteMedicineButtonText: {
    color: "#C0392B",
    fontSize: 15,
    fontWeight: "bold",
  },

  disabledButton: {
    opacity: 0.5,
  },

  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  loadingText: {
    color: "#64748B",
    marginTop: 12,
  },

  errorIcon: {
    fontSize: 45,
    marginBottom: 15,
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#173D35",
  },

  errorText: {
    fontSize: 14,
    color: "#82918D",
    textAlign: "center",
    marginTop: 10,
  },

  backButton: {
    backgroundColor: "#287A65",
    paddingVertical: 13,
    paddingHorizontal: 25,
    borderRadius: 12,
    marginTop: 20,
  },

  backButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});
