import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import {
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HealthRecordRow } from "@/components/health/health-record-row";
import { HEALTH_METRICS } from "@/constants/health-metrics";
import { useUserProfiles } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";
import {
  deleteHealthRecord,
  getHealthRecords,
  getLatestHealthRecords,
} from "@/services/healthService";
import type { HealthMetric, HealthRecord } from "@/types/health";

export default function HealthScreen() {
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const colors = useTheme();

  const [latestRecords, setLatestRecords] = useState<HealthRecord[]>([]);
  const [recentRecords, setRecentRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    if (!activeProfile) return [[], []] as [HealthRecord[], HealthRecord[]];

    return Promise.all([
      getLatestHealthRecords(database, activeProfile.id),
      getHealthRecords(database, activeProfile.id, { limit: 5 }),
    ]);
  }, [activeProfile, database]);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;

      setLoading(true);
      setLoadError(null);

      void loadRecords()
        .then(([latest, recent]) => {
          if (isCurrent) {
            setLatestRecords(latest);
            setRecentRecords(recent);
          }
        })
        .catch((error: unknown) => {
          console.error("Error loading health records:", error);

          if (isCurrent) {
            setLoadError("Health records could not be loaded.");
          }
        })
        .finally(() => {
          if (isCurrent) setLoading(false);
        });

      return () => {
        isCurrent = false;
      };
    }, [loadRecords]),
  );

  const deleteRecord = async (recordId: number) => {
    if (!activeProfile) return;

    let deleted: boolean;

    try {
      deleted = await deleteHealthRecord(database, recordId, activeProfile.id);
    } catch (error) {
      console.error("Error deleting health record:", error);

      Alert.alert(
        "Could not delete record",
        "Please try again. Your health record was not deleted.",
      );
      return;
    }

    if (!deleted) {
      Alert.alert(
        "Record not found",
        "This health record may already be deleted.",
      );
      return;
    }

    try {
      const [latest, recent] = await loadRecords();

      setLatestRecords(latest);
      setRecentRecords(recent);
      setLoadError(null);
    } catch (error) {
      console.error("Error refreshing health records after deletion:", error);

      setLatestRecords((current) =>
        current.filter((record) => record.id !== recordId),
      );

      setRecentRecords((current) =>
        current.filter((record) => record.id !== recordId),
      );

      setLoadError("Record deleted. The list could not be refreshed.");
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

  const openAddRecord = (metric: HealthMetric) => {
    router.push({ pathname: "/health/add-record", params: { metric } });
  };

  const openEditRecord = (recordId: number) => {
    router.push({
      pathname: "/health/add-record",
      params: { id: String(recordId) },
    });
  };

  const latestByMetric = new Map(
    latestRecords.map((record) => [record.metric, record]),
  );

  return (
    <ImageBackground
      source={require("@/assets/images/health-tracking-background.jpg")}
      style={styles.background}
      imageStyle={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>
              YOUR WELLNESS
            </Text>

            <Text style={[styles.title, { color: colors.text }]}>
              Health Tracker
            </Text>

            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Record your readings and see how they change over time.
            </Text>
          </View>

          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Track a reading
            </Text>

            <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
              Tap a card to add a reading
            </Text>
          </View>

          <View style={styles.metricGrid}>
            {HEALTH_METRICS.map((metric) => {
              const latest = latestByMetric.get(metric.type);

              return (
                <Pressable
                  key={metric.type}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${metric.name} reading`}
                  onPress={() => openAddRecord(metric.type)}
                  style={({ pressed }) => [
                    styles.metricCard,
                    {
                      backgroundColor: colors.backgroundElement,
                      borderColor: colors.border,
                    },
                    pressed && styles.pressedCard,
                  ]}
                >
                  <View style={styles.metricTop}>
                    <Text style={styles.metricIcon}>{metric.icon}</Text>

                    <Text style={[styles.addSymbol, { color: colors.accent }]}>
                      ＋
                    </Text>
                  </View>

                  <Text style={[styles.metricName, { color: colors.text }]}>
                    {metric.name}
                  </Text>

                  <Text
                    style={[
                      styles.metricValue,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {latest
                      ? `${latest.value} ${latest.unit}`
                      : "No readings yet"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => openAddRecord("custom")}
            style={({ pressed }) => [
              styles.customButton,
              pressed && styles.pressedButton,
            ]}
          >
            <Text style={styles.customButtonText}>＋ Add custom reading</Text>
          </Pressable>

          <View style={styles.historyHeading}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Recent readings
              </Text>

              <Text
                style={[styles.sectionHint, { color: colors.textSecondary }]}
              >
                {loading
                  ? "Loading your records..."
                  : "Your latest health entries"}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/health/health-history")}
              style={styles.viewAllButton}
            >
              <Text style={[styles.viewAllText, { color: colors.accent }]}>
                View all
              </Text>
            </Pressable>
          </View>

          {loadError ? (
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {loadError}
            </Text>
          ) : recentRecords.length === 0 && !loading ? (
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
                No readings recorded yet
              </Text>

              <Text
                style={[
                  styles.emptyDescription,
                  { color: colors.textSecondary },
                ]}
              >
                Add your first reading to start building your health history.
              </Text>
            </View>
          ) : (
            recentRecords.map((record) => (
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  backgroundImage: {
    opacity: 0.22,
  },

  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },

  scrollView: {
    backgroundColor: "transparent",
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },

  header: {
    marginBottom: 26,
  },

  eyebrow: {
    color: "#37836C",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },

  title: {
    color: "#123F35",
    fontSize: 30,
    fontWeight: "700",
    marginTop: 5,
  },

  subtitle: {
    color: "#72817C",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
  },

  sectionHeading: {
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#194B3E",
    fontSize: 19,
    fontWeight: "700",
  },

  sectionHint: {
    color: "#83918C",
    fontSize: 13,
    marginTop: 4,
  },

  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },

  metricCard: {
    width: "48%",
    minHeight: 132,
    backgroundColor: "#FFFFFF",
    borderColor: "#E8EFEC",
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    justifyContent: "space-between",
  },

  pressedCard: {
    opacity: 0.8,
  },

  metricTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },

  metricIcon: {
    color: "#318368",
    fontSize: 23,
    fontWeight: "700",
  },

  addSymbol: {
    color: "#4D907D",
    fontSize: 23,
  },

  metricName: {
    color: "#21493F",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 14,
  },

  metricValue: {
    color: "#75837E",
    fontSize: 13,
    marginTop: 5,
  },

  customButton: {
    alignItems: "center",
    backgroundColor: "#E6F3EE",
    borderRadius: 14,
    marginTop: 14,
    paddingVertical: 15,
  },

  pressedButton: {
    opacity: 0.8,
  },

  customButtonText: {
    color: "#236B55",
    fontSize: 15,
    fontWeight: "700",
  },

  historyHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
    marginBottom: 12,
  },

  viewAllButton: {
    padding: 8,
  },

  viewAllText: {
    color: "#2D8067",
    fontSize: 14,
    fontWeight: "700",
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

  emptyDescription: {
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
