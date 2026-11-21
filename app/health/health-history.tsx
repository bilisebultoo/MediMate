import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { HealthRecordRow } from "@/components/health/health-record-row";
import { useUserProfiles } from "@/context/UserContext";
import {
  deleteHealthRecord,
  getHealthRecords,
} from "@/services/healthService";
import type { HealthRecord } from "@/types/health";

const DATE_FILTERS = [7, 30, 90] as const;
type DateFilter = (typeof DATE_FILTERS)[number];

export default function HealthHistoryScreen() {
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const [rangeDays, setRangeDays] = useState<DateFilter>(7);
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - rangeDays + 1);
      cutoff.setHours(0, 0, 0, 0);

      const loadRecords = async () => {
        setLoading(true);
        setLoadError(null);
        try {
          if (!activeProfile) return;
          const result = await getHealthRecords(
            database,
            activeProfile.id,
            {
              fromDate: cutoff.toISOString(),
              search,
            },
          );
          if (isCurrent) setRecords(result);
        } catch (error) {
          console.error("Error loading health history:", error);
          if (isCurrent) setLoadError("Health history could not be loaded.");
        } finally {
          if (isCurrent) setLoading(false);
        }
      };

      void loadRecords();
      return () => {
        isCurrent = false;
      };
    }, [activeProfile, database, rangeDays, search]),
  );

  const openEditRecord = (recordId: number) => {
    router.push({
      pathname: "/health/add-record",
      params: { id: String(recordId) },
    });
  };

  const deleteRecord = async (recordId: number) => {
    if (!activeProfile) return;
    try {
      const deleted = await deleteHealthRecord(
        database,
        recordId,
        activeProfile.id,
      );
      if (!deleted) {
        Alert.alert("Record not found", "This health record may already be deleted.");
        return;
      }
      setRecords((current) =>
        current.filter((record) => record.id !== recordId),
      );
    } catch (error) {
      console.error("Error deleting health record:", error);
      Alert.alert(
        "Could not delete record",
        "Please try again. Your health record was not deleted.",
      );
    }
  };

  const confirmDeleteRecord = (recordId: number) => {
    Alert.alert(
      "Delete health record?",
      "This reading will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteRecord(recordId),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹  Health Tracker</Text>
        </Pressable>

        <Text style={styles.title}>Health history</Text>
        <Text style={styles.subtitle}>
          Review your readings and notes over time.
        </Text>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search readings"
          accessibilityLabel="Search health records"
          style={styles.searchInput}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />

        <Text style={styles.filterLabel}>Date range</Text>
        <View style={styles.filterRow}>
          {DATE_FILTERS.map((days) => (
            <Pressable
              key={days}
              accessibilityRole="button"
              accessibilityState={{ selected: rangeDays === days }}
              onPress={() => setRangeDays(days)}
              style={[
                styles.filterButton,
                rangeDays === days && styles.activeFilterButton,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  rangeDays === days && styles.activeFilterText,
                ]}
              >
                {days} days
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.resultsTitle}>Readings</Text>
        {loadError ? (
          <Text style={styles.errorText}>{loadError}</Text>
        ) : loading ? (
          <Text style={styles.emptyText}>Loading health history...</Text>
        ) : records.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No readings found</Text>
            <Text style={styles.emptyText}>
              {search
                ? "Try another search or date range."
                : `There are no health records in the last ${rangeDays} days.`}
            </Text>
          </View>
        ) : (
          records.map((record) => (
            <HealthRecordRow
              key={record.id}
              record={record}
              onEdit={() => openEditRecord(record.id)}
              onDelete={() => confirmDeleteRecord(record.id)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F5FAF8",
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: 18,
    paddingVertical: 6,
  },
  backText: {
    color: "#2D8067",
    fontSize: 15,
    fontWeight: "700",
  },
  title: {
    color: "#123F35",
    fontSize: 29,
    fontWeight: "700",
  },
  subtitle: {
    color: "#72817C",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    marginBottom: 20,
  },
  searchInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE9E4",
    borderWidth: 1,
    borderRadius: 13,
    color: "#263F37",
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  filterLabel: {
    color: "#29483F",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 9,
  },
  filterRow: {
    flexDirection: "row",
    gap: 9,
  },
  filterButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE9E4",
    borderWidth: 1,
    borderRadius: 18,
    flex: 1,
    paddingVertical: 10,
  },
  activeFilterButton: {
    backgroundColor: "#E4F2EC",
    borderColor: "#4F9B7E",
  },
  filterText: {
    color: "#74817C",
    fontSize: 13,
    fontWeight: "600",
  },
  activeFilterText: {
    color: "#236B55",
  },
  resultsTitle: {
    color: "#194B3E",
    fontSize: 19,
    fontWeight: "700",
    marginTop: 28,
    marginBottom: 12,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8EFEC",
    borderWidth: 1,
    borderRadius: 18,
    padding: 22,
  },
  emptyTitle: {
    color: "#29483F",
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    color: "#7A8883",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
    textAlign: "center",
  },
  errorText: {
    color: "#B54848",
    fontSize: 14,
    paddingVertical: 12,
  },
});
