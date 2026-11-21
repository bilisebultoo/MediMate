import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { HealthRecordRow } from "@/components/health/health-record-row";
import { useUserProfiles } from "@/context/UserContext";
import { getHealthRecords } from "@/services/healthService";
import { exportReportCsv } from "../../services/reportExport";
import type { HealthRecord } from "@/types/health";

type ReportTab = "medication" | "health";
type MedicationStatus = "PENDING" | "TAKEN" | "MISSED" | "SKIPPED";
type MedicationRecord = {
  id: number;
  medicine_name: string;
  dose: string;
  scheduled_date: string;
  scheduled_time: string;
  status: MedicationStatus;
  taken_at: string | null;
};

const DATE_FILTERS = [7, 30, 90] as const;
type DateFilter = (typeof DATE_FILTERS)[number];

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getDateRangeStart(days: number): Date {
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatScheduledDate(dateValue: string, timeValue: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!dateMatch || !timeMatch) return `${dateValue} · ${timeValue}`;

  const date = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  if (Number.isNaN(date.getTime())) return `${dateValue} · ${timeValue}`;

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function escapeCsvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const isNumeric = text.trim().length > 0 && Number.isFinite(Number(text));
  const formulaPrefix = /^[\t\r\n ]*[=+@-]/.test(text) && !isNumeric;
  const safeText = formulaPrefix ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function createCsv(rows: (string | number | null)[][]): string {
  return `\uFEFF${rows
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n")}`;
}

export default function ReportsScreen() {
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const [activeTab, setActiveTab] = useState<ReportTab>("medication");
  const [rangeDays, setRangeDays] = useState<DateFilter>(7);
  const [search, setSearch] = useState("");
  const [medicationRecords, setMedicationRecords] = useState<
    MedicationRecord[]
  >([]);
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      const start = getDateRangeStart(rangeDays);
      const now = new Date();
      const endDate = formatLocalDate(now);
      const endTime = formatLocalTime(now);
      const searchTerm = search.trim();

      const loadRecords = async () => {
        setLoading(true);
        setLoadError(null);
        try {
          if (!activeProfile) return;
          if (activeTab === "medication") {
            const nameSearch = `%${searchTerm}%`;
            const records = await database.getAllAsync<MedicationRecord>(
              `SELECT h.id,
                      m.name AS medicine_name,
                      m.dose,
                      h.scheduled_date,
                      h.scheduled_time,
                      h.status,
                      h.taken_at
               FROM medication_history h
               JOIN medicines m ON m.id = h.medicine_id
               WHERE h.user_id = ?
                 AND h.scheduled_date >= ?
                 AND (
                   h.scheduled_date < ?
                   OR (
                     h.scheduled_date = ?
                     AND h.scheduled_time <= ?
                   )
                 )
                 AND m.name LIKE ? COLLATE NOCASE
               ORDER BY h.scheduled_date DESC,
                        h.scheduled_time DESC,
                        h.id DESC`,
              activeProfile.id,
              formatLocalDate(start),
              endDate,
              endDate,
              endTime,
              nameSearch,
            );
            if (isCurrent) setMedicationRecords(records);
          } else {
            const records = await getHealthRecords(
              database,
              activeProfile.id,
              {
                fromDate: start.toISOString(),
                search: searchTerm,
              },
            );
            if (isCurrent) setHealthRecords(records);
          }
        } catch (error) {
          console.error("Error loading reports:", error);
          if (isCurrent) setLoadError("Records could not be loaded.");
        } finally {
          if (isCurrent) setLoading(false);
        }
      };

      void loadRecords();
      return () => {
        isCurrent = false;
      };
    }, [activeProfile, activeTab, database, rangeDays, search]),
  );

  const takenCount = medicationRecords.filter(
    (record) => record.status === "TAKEN",
  ).length;
  const missedCount = medicationRecords.filter(
    (record) => record.status === "MISSED",
  ).length;
  const pendingCount = medicationRecords.filter(
    (record) => record.status === "PENDING",
  ).length;
  const skippedCount = medicationRecords.filter(
    (record) => record.status === "SKIPPED",
  ).length;

  const handleExport = async () => {
    if (isExporting || loading || loadError) return;

    const now = new Date();
    const dateSuffix = now.toISOString().slice(0, 10);
    const filename = `medimate-${activeTab}-report-${rangeDays}-days-${dateSuffix}-${now.getTime()}.csv`;
    const rows =
      activeTab === "medication"
        ? [
            [
              "Medicine",
              "Dose",
              "Scheduled Date",
              "Scheduled Time",
              "Status",
              "Taken At",
            ],
            ...medicationRecords.map((record) => [
              record.medicine_name,
              record.dose,
              record.scheduled_date,
              record.scheduled_time,
              record.status,
              record.taken_at ?? "",
            ]),
          ]
        : [
            ["Measurement", "Value", "Unit", "Recorded At", "Notes"],
            ...healthRecords.map((record) => [
              record.name,
              record.value,
              record.unit,
              record.recorded_at,
              record.notes,
            ]),
          ];

    if (rows.length === 1) return;

    setIsExporting(true);
    setExportError(null);
    setExportMessage(null);
    try {
      await exportReportCsv(filename, createCsv(rows));
      setExportMessage("CSV export ready.");
    } catch (error) {
      console.error("Error exporting report CSV:", error);
      setExportError("The CSV could not be exported. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>YOUR RECORDS</Text>
        <Text style={styles.title}>Reports &amp; Logbook</Text>
        <Text style={styles.subtitle}>
          Review your medication history and health measurements.
        </Text>

        <View style={styles.tabs}>
          <ReportTabButton
            title="Medication"
            selected={activeTab === "medication"}
            onPress={() => setActiveTab("medication")}
          />
          <ReportTabButton
            title="Health"
            selected={activeTab === "health"}
            onPress={() => setActiveTab("health")}
          />
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={
            activeTab === "medication"
              ? "Search by medicine name"
              : "Search health measurements"
          }
          accessibilityLabel={
            activeTab === "medication"
              ? "Search by medicine name"
              : "Search health measurements"
          }
          style={styles.searchInput}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />

        <Text style={styles.filterTitle}>Date filter</Text>
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

        <Pressable
          accessibilityRole="button"
          disabled={
            isExporting ||
            loading ||
            loadError !== null ||
            (activeTab === "medication"
              ? medicationRecords.length === 0
              : healthRecords.length === 0)
          }
          onPress={() => void handleExport()}
          style={({ pressed }) => [
            styles.exportButton,
            pressed && styles.exportButtonPressed,
            (isExporting || loading) && styles.exportButtonDisabled,
          ]}
        >
          <Text style={styles.exportButtonText}>
            {isExporting ? "Preparing CSV..." : "Export & Share CSV"}
          </Text>
        </Pressable>
        <Text style={styles.exportHint}>
          Exports the current tab, search, and date range.
        </Text>
        {exportError ? (
          <Text style={styles.exportError}>{exportError}</Text>
        ) : exportMessage ? (
          <Text style={styles.exportMessage}>{exportMessage}</Text>
        ) : null}

        {activeTab === "medication" ? (
          <>
            <Text style={styles.sectionTitle}>Medication records</Text>
            <Text style={styles.recordCount}>
              {medicationRecords.length} records in the last {rangeDays} days
            </Text>
            <View style={styles.statsGrid}>
              <StatCard title="Taken" count={takenCount} tone="taken" />
              <StatCard title="Missed" count={missedCount} tone="missed" />
              <StatCard title="Pending" count={pendingCount} tone="pending" />
            </View>
            {!loading && !loadError && (
              <MedicationSummaryChart
                items={[
                  { label: "Taken", count: takenCount, color: "#2F8A65" },
                  { label: "Missed", count: missedCount, color: "#C05252" },
                  { label: "Skipped", count: skippedCount, color: "#B77924" },
                  { label: "Pending", count: pendingCount, color: "#6386B5" },
                ]}
              />
            )}

            {loadError ? (
              <Text style={styles.errorText}>{loadError}</Text>
            ) : loading ? (
              <Text style={styles.emptyText}>Loading medication history...</Text>
            ) : medicationRecords.length === 0 ? (
              <EmptyState
                title="No medication records found"
                message={
                  search
                    ? "Try a different medicine name or date range."
                    : `There are no medication records in the last ${rangeDays} days.`
                }
              />
            ) : (
              medicationRecords.map((record) => (
                <MedicationRecordCard key={record.id} record={record} />
              ))
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Health measurements</Text>
            <Text style={styles.recordCount}>
              {healthRecords.length} records in the last {rangeDays} days
            </Text>

            {loadError ? (
              <Text style={styles.errorText}>{loadError}</Text>
            ) : loading ? (
              <Text style={styles.emptyText}>Loading health history...</Text>
            ) : healthRecords.length === 0 ? (
              <EmptyState
                title="No health records found"
                message={
                  search
                    ? "Try a different measurement name or date range."
                    : `There are no health records in the last ${rangeDays} days.`
                }
              />
            ) : (
              <>
                <HealthTrendCharts records={healthRecords} />
                {healthRecords.map((record) => (
                  <HealthRecordRow key={record.id} record={record} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportTabButton({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tabButton, selected && styles.selectedTabButton]}
    >
      <Text style={[styles.tabText, selected && styles.selectedTabText]}>
        {title}
      </Text>
    </Pressable>
  );
}

function StatCard({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone: "taken" | "missed" | "pending";
}) {
  return (
    <View style={[styles.statCard, styles[`${tone}StatCard`]]}>
      <Text style={[styles.statCount, styles[`${tone}StatText`]]}>{count}</Text>
      <Text style={[styles.statTitle, styles[`${tone}StatText`]]}>{title}</Text>
    </View>
  );
}

function MedicationRecordCard({ record }: { record: MedicationRecord }) {
  const statusLabel =
    record.status.charAt(0) + record.status.slice(1).toLowerCase();

  return (
    <View style={styles.medicationCard}>
      <View style={styles.medicationHeader}>
        <View style={styles.medicineIcon}>
          <Text style={styles.medicineIconText}>✚</Text>
        </View>
        <View style={styles.medicineDetails}>
          <Text style={styles.medicineName}>{record.medicine_name}</Text>
          <Text style={styles.medicineDose}>{record.dose}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            record.status === "TAKEN"
              ? styles.takenBadge
              : record.status === "MISSED"
                ? styles.missedBadge
                : record.status === "SKIPPED"
                  ? styles.skippedBadge
                  : styles.pendingBadge,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              record.status === "TAKEN"
                ? styles.takenText
                : record.status === "MISSED"
                  ? styles.missedText
                  : record.status === "SKIPPED"
                    ? styles.skippedText
                    : styles.pendingText,
            ]}
          >
            {statusLabel}
          </Text>
        </View>
      </View>
      <Text style={styles.scheduledDate}>
        Scheduled {formatScheduledDate(record.scheduled_date, record.scheduled_time)}
      </Text>
      {record.status === "TAKEN" && record.taken_at ? (
        <Text style={styles.takenAt}>
          Taken {formatTimestamp(record.taken_at)}
        </Text>
      ) : null}
    </View>
  );
}

type MedicationChartItem = {
  label: string;
  count: number;
  color: string;
};

function MedicationSummaryChart({
  items,
}: {
  items: MedicationChartItem[];
}) {
  const maximumCount = Math.max(0, ...items.map((item) => item.count));

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>Dose status overview</Text>
      <Text style={styles.chartDescription}>
        Counts for the selected date range
      </Text>
      {items.map((item) => {
        const percentage =
          maximumCount === 0 ? 0 : (item.count / maximumCount) * 100;
        const barWidth = `${percentage}%` as `${number}%`;

        return (
          <View key={item.label} style={styles.medicationChartRow}>
            <Text style={styles.chartLabel}>{item.label}</Text>
            <View style={styles.chartTrack}>
              <View
                style={[
                  styles.chartBar,
                  { width: barWidth, backgroundColor: item.color },
                ]}
              />
            </View>
            <Text style={styles.chartCount}>{item.count}</Text>
          </View>
        );
      })}
    </View>
  );
}

type HealthTrendPoint = {
  id: string;
  dateLabel: string;
  value: number;
  valueLabel: string;
  series?: "systolic" | "diastolic";
};

type HealthTrend = {
  id: string;
  name: string;
  unit: string;
  readingCount: number;
  points: HealthTrendPoint[];
};

function buildHealthTrends(records: HealthRecord[]): HealthTrend[] {
  const groups = new Map<
    string,
    { name: string; unit: string; records: HealthRecord[] }
  >();

  for (const record of records) {
    const nameKey =
      record.metric === "custom" ? record.name.trim().toLowerCase() : record.metric;
    const key = `${record.metric}:${nameKey}:${record.unit}`;
    const group = groups.get(key);
    if (group) {
      group.records.push(record);
    } else {
      groups.set(key, {
        name: record.name,
        unit: record.unit,
        records: [record],
      });
    }
  }

  return Array.from(groups.entries()).map(([id, group]) => {
    const readingCount = group.records.length;
    const orderedRecords = [...group.records]
      .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at))
      .slice(-10);
    const points: HealthTrendPoint[] = [];

    for (const record of orderedRecords) {
      const date = new Date(record.recorded_at);
      if (Number.isNaN(date.getTime())) continue;
      const dateLabel = date.toLocaleDateString(undefined, {
        month: "numeric",
        day: "numeric",
      });

      if (record.metric === "blood_pressure") {
        const [systolicValue, diastolicValue] = record.value.split("/");
        const systolic = Number(systolicValue);
        const diastolic = Number(diastolicValue);
        if (Number.isFinite(systolic) && Number.isFinite(diastolic)) {
          points.push(
            {
              id: `${record.id}-systolic`,
              dateLabel,
              value: systolic,
              valueLabel: systolicValue,
              series: "systolic",
            },
            {
              id: `${record.id}-diastolic`,
              dateLabel,
              value: diastolic,
              valueLabel: diastolicValue,
              series: "diastolic",
            },
          );
        }
        continue;
      }

      const value = Number(record.value.trim());
      if (record.value.trim() && Number.isFinite(value)) {
        points.push({
          id: String(record.id),
          dateLabel,
          value,
          valueLabel: record.value,
        });
      }
    }

    return {
      id,
      name: group.name,
      unit: group.unit,
      readingCount,
      points,
    };
  });
}

function HealthTrendCharts({ records }: { records: HealthRecord[] }) {
  return (
    <View style={styles.trendsSection}>
      <Text style={styles.chartTitle}>Measurement trends</Text>
      <Text style={styles.chartDescription}>
        Recorded values over time; no medical interpretation.
      </Text>
      {buildHealthTrends(records).map((trend) => (
        <HealthTrendChart key={trend.id} trend={trend} />
      ))}
    </View>
  );
}

function HealthTrendChart({ trend }: { trend: HealthTrend }) {
  const maximumValue = Math.max(0, ...trend.points.map((point) => point.value));
  const hasBloodPressureSeries = trend.points.some((point) => point.series);

  return (
    <View style={styles.trendCard}>
      <View style={styles.trendHeader}>
        <Text style={styles.trendTitle}>{trend.name}</Text>
        <Text style={styles.trendUnit}>{trend.unit}</Text>
      </View>
      <Text style={styles.trendCount}>
        {trend.readingCount > 10
          ? `Latest 10 of ${trend.readingCount} readings`
          : `${trend.readingCount} ${trend.readingCount === 1 ? "reading" : "readings"}`}
      </Text>
      {hasBloodPressureSeries && (
        <View style={styles.legendRow}>
          <LegendItem title="Systolic" color="#2F8A65" />
          <LegendItem title="Diastolic" color="#718FC1" />
        </View>
      )}
      {trend.points.length === 0 ? (
        <Text style={styles.noChartData}>
          No numeric readings are available to chart.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendPlot}
        >
          {trend.points.map((point) => {
            const barHeight =
              maximumValue > 0
                ? Math.max(4, (point.value / maximumValue) * 84)
                : 4;
            const barColor =
              point.series === "systolic"
                ? "#2F8A65"
                : point.series === "diastolic"
                  ? "#718FC1"
                  : "#4D9A7D";

            return (
              <View key={point.id} style={styles.trendPoint}>
                <Text style={styles.trendValue}>{point.valueLabel}</Text>
                <View style={styles.trendBarArea}>
                  <View
                    style={[
                      styles.trendBar,
                      { height: barHeight, backgroundColor: barColor },
                    ]}
                  />
                </View>
                <Text style={styles.trendDate}>{point.dateLabel}</Text>
                {point.series && (
                  <Text style={styles.trendSeries}>
                    {point.series === "systolic" ? "Sys" : "Dia"}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function LegendItem({ title, color }: { title: string; color: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{title}</Text>
    </View>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F5FAF8",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
  eyebrow: {
    color: "#37836C",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    color: "#123F35",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 5,
  },
  subtitle: {
    color: "#72817C",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    marginBottom: 20,
  },
  tabs: {
    backgroundColor: "#E8F0EC",
    borderRadius: 13,
    flexDirection: "row",
    marginBottom: 16,
    padding: 4,
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    paddingVertical: 11,
  },
  selectedTabButton: {
    backgroundColor: "#FFFFFF",
  },
  tabText: {
    color: "#71817A",
    fontSize: 14,
    fontWeight: "600",
  },
  selectedTabText: {
    color: "#236B55",
    fontWeight: "700",
  },
  searchInput: {
    minHeight: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#DDE9E4",
    backgroundColor: "#FFFFFF",
    color: "#263F37",
    fontSize: 15,
    paddingHorizontal: 14,
  },
  filterTitle: {
    color: "#29483F",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 9,
  },
  filterRow: {
    flexDirection: "row",
    gap: 9,
  },
  exportButton: {
    alignItems: "center",
    backgroundColor: "#218164",
    borderRadius: 13,
    marginTop: 16,
    paddingVertical: 14,
  },
  exportButtonPressed: {
    opacity: 0.82,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  exportHint: {
    color: "#83918C",
    fontSize: 11,
    marginTop: 6,
    textAlign: "center",
  },
  exportError: {
    color: "#B54848",
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },
  exportMessage: {
    color: "#287A58",
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
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
  sectionTitle: {
    color: "#194B3E",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 26,
  },
  recordCount: {
    color: "#83918C",
    fontSize: 13,
    marginTop: 4,
    marginBottom: 13,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 18,
  },
  statCard: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
    paddingVertical: 12,
  },
  takenStatCard: {
    backgroundColor: "#E8F5EE",
  },
  missedStatCard: {
    backgroundColor: "#FCECEC",
  },
  pendingStatCard: {
    backgroundColor: "#FFF4E5",
  },
  statCount: {
    fontSize: 20,
    fontWeight: "700",
  },
  statTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  takenStatText: {
    color: "#287A58",
  },
  missedStatText: {
    color: "#C05252",
  },
  pendingStatText: {
    color: "#B77924",
  },
  chartCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8EFEC",
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 18,
    padding: 15,
  },
  chartTitle: {
    color: "#29483F",
    fontSize: 16,
    fontWeight: "700",
  },
  chartDescription: {
    color: "#83918C",
    fontSize: 12,
    marginTop: 4,
  },
  medicationChartRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 13,
  },
  chartLabel: {
    color: "#53665E",
    fontSize: 12,
    width: 58,
  },
  chartTrack: {
    backgroundColor: "#EEF2F0",
    borderRadius: 5,
    flex: 1,
    height: 9,
    overflow: "hidden",
  },
  chartBar: {
    borderRadius: 5,
    height: "100%",
  },
  chartCount: {
    color: "#29483F",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    width: 30,
  },
  trendsSection: {
    marginBottom: 20,
  },
  trendCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8EFEC",
    borderWidth: 1,
    borderRadius: 16,
    marginTop: 12,
    padding: 14,
  },
  trendHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  trendTitle: {
    color: "#29483F",
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  trendUnit: {
    color: "#83918C",
    fontSize: 12,
    marginLeft: 8,
  },
  trendCount: {
    color: "#83918C",
    fontSize: 11,
    marginTop: 4,
  },
  legendRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 10,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
  },
  legendSwatch: {
    borderRadius: 4,
    height: 8,
    marginRight: 5,
    width: 8,
  },
  legendText: {
    color: "#71817A",
    fontSize: 11,
  },
  noChartData: {
    color: "#83918C",
    fontSize: 12,
    marginTop: 16,
  },
  trendPlot: {
    alignItems: "flex-end",
    flexDirection: "row",
    paddingTop: 15,
  },
  trendPoint: {
    alignItems: "center",
    marginRight: 7,
    width: 43,
  },
  trendValue: {
    color: "#53665E",
    fontSize: 10,
    marginBottom: 3,
  },
  trendBarArea: {
    alignItems: "center",
    height: 88,
    justifyContent: "flex-end",
    width: 22,
  },
  trendBar: {
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    width: 15,
  },
  trendDate: {
    color: "#83918C",
    fontSize: 10,
    marginTop: 5,
  },
  trendSeries: {
    color: "#83918C",
    fontSize: 9,
    marginTop: 1,
  },
  medicationCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8EFEC",
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 10,
    padding: 15,
  },
  medicationHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  medicineIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#E5F3ED",
    marginRight: 11,
  },
  medicineIconText: {
    color: "#318368",
    fontSize: 21,
    fontWeight: "700",
  },
  medicineDetails: {
    flex: 1,
  },
  medicineName: {
    color: "#21493F",
    fontSize: 15,
    fontWeight: "700",
  },
  medicineDose: {
    color: "#71817A",
    fontSize: 13,
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  takenBadge: {
    backgroundColor: "#E8F5EE",
  },
  missedBadge: {
    backgroundColor: "#FCECEC",
  },
  skippedBadge: {
    backgroundColor: "#FFF4E5",
  },
  pendingBadge: {
    backgroundColor: "#EEF1F0",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  takenText: {
    color: "#287A58",
  },
  missedText: {
    color: "#C05252",
  },
  skippedText: {
    color: "#B77924",
  },
  pendingText: {
    color: "#65736E",
  },
  scheduledDate: {
    color: "#778780",
    fontSize: 12,
    marginTop: 12,
  },
  takenAt: {
    color: "#287A58",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
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
    textAlign: "center",
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
