import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import type { HealthRecord } from "@/types/health";

export function formatHealthRecordDate(recordedAt: string): string {
  const date = new Date(recordedAt);
  return Number.isNaN(date.getTime())
    ? recordedAt
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function HealthRecordRow({
  record,
  onEdit,
  onDelete,
}: {
  record: HealthRecord;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.recordCard,
        {
          backgroundColor: colors.backgroundElement,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.recordHeader}>
        <Text style={[styles.recordName, { color: colors.text }]}>
          {record.name}
        </Text>
        <Text style={[styles.recordValue, { color: colors.accent }]}>
          {record.value}
          {record.unit ? ` ${record.unit}` : ""}
        </Text>
      </View>
      <Text style={[styles.recordDate, { color: colors.textSecondary }]}>
        {formatHealthRecordDate(record.recorded_at)}
      </Text>
      {record.notes ? (
        <Text style={[styles.recordNotes, { color: colors.textSecondary }]}>
          {record.notes}
        </Text>
      ) : null}
      {(onEdit || onDelete) && (
        <View style={styles.recordActions}>
          {onEdit && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${record.name} reading`}
              onPress={onEdit}
              style={styles.actionButton}
            >
              <Text style={[styles.editAction, { color: colors.accent }]}>
                Edit
              </Text>
            </Pressable>
          )}
          {onDelete && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${record.name} reading`}
              onPress={onDelete}
              style={styles.actionButton}
            >
              <Text style={[styles.deleteAction, { color: colors.danger }]}>
                Delete
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  recordCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8EFEC",
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 10,
    padding: 15,
  },
  recordHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  recordName: {
    color: "#26493F",
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  recordValue: {
    color: "#1C6F56",
    fontSize: 15,
    fontWeight: "700",
  },
  recordDate: {
    color: "#82908B",
    fontSize: 12,
    marginTop: 7,
  },
  recordNotes: {
    color: "#677771",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  recordActions: {
    borderTopColor: "#E8EFEC",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    paddingTop: 8,
  },
  actionButton: {
    marginLeft: 18,
    padding: 5,
  },
  editAction: {
    color: "#2D8067",
    fontSize: 13,
    fontWeight: "700",
  },
  deleteAction: {
    color: "#BD4A4A",
    fontSize: 13,
    fontWeight: "700",
  },
});
