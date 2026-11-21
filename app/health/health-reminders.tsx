import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";
import { HEALTH_METRICS } from "@/constants/health-metrics";
import {
  createHealthReminder,
  deleteHealthReminder,
  getHealthReminders,
} from "@/services/healthReminderService";
import { refreshHealthReminderNotifications } from "@/services/healthReminderNotifications";
import { requestMedicationDosePermissions } from "@/services/medicationDoseNotifications";
import type { HealthMetric } from "@/types/health";
import type {
  HealthReminder,
  HealthReminderRepeat,
} from "@/types/healthReminder";
import { useTheme } from "@/hooks/use-theme";
import HealthReminderWebInput from "@/components/health/health-reminder-web-input";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function formatDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value: Date): string {
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return formatDate(date) === value ? date : null;
}

function parseTimeInput(value: string): Date | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

function formatReminderDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getMetricName(metric: HealthMetric, customLabel: string | null) {
  if (metric === "custom") return customLabel || "Health measurement";
  return HEALTH_METRICS.find((item) => item.type === metric)?.name ?? metric;
}

function getRepeatDescription(reminder: HealthReminder): string {
  if (reminder.repeatType === "once") {
    return `Once · ${formatReminderDate(reminder.startDate)}`;
  }
  const days = WEEKDAYS.filter((day) => reminder.repeatDays.includes(day.value))
    .map((day) => day.label)
    .join(", ");
  return `Every week · ${days}`;
}

export default function HealthRemindersScreen() {
  const database = useSQLiteContext();
  const { activeProfile, isLoading: profileLoading } = useUserProfiles();
  const profileId = activeProfile?.id ?? null;
  const colors = useTheme();
  const [reminders, setReminders] = useState<HealthReminder[]>([]);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metric, setMetric] = useState<HealthMetric>("blood_pressure");
  const [customLabel, setCustomLabel] = useState("");
  const [startDate, setStartDate] = useState(() => new Date());
  const [scheduledTime, setScheduledTime] = useState(() => {
    const date = new Date();
    date.setHours(9, 0, 0, 0);
    return date;
  });
  const [repeatType, setRepeatType] =
    useState<HealthReminderRepeat>("once");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profileId) return;
      let isCurrent = true;
      void getHealthReminders(database, profileId)
        .then((records) => {
          if (!isCurrent) return;
          setReminders(records);
          setLoadedProfileId(profileId);
          setLoadError(null);
        })
        .catch((error: unknown) => {
          console.error("Could not load health reminders:", error);
          if (!isCurrent) return;
          setLoadedProfileId(profileId);
          setLoadError("Health reminders could not be loaded.");
        });
      return () => {
        isCurrent = false;
      };
    }, [database, profileId]),
  );

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type === "dismissed") {
      setPicker(null);
      return;
    }
    if (selectedDate) {
      if (picker === "date") {
        setStartDate(selectedDate);
      } else {
        setScheduledTime(selectedDate);
      }
    }
    if (Platform.OS !== "ios") setPicker(null);
  };

  const handleSave = async () => {
    if (!profileId || saving) return;
    if (metric === "custom" && !customLabel.trim()) {
      Alert.alert("Name the measurement", "Enter a name for this health reminder.");
      return;
    }
    if (repeatType === "weekly" && repeatDays.length === 0) {
      Alert.alert("Choose days", "Select at least one day for the weekly reminder.");
      return;
    }
    if (formatDate(startDate) < formatDate(new Date())) {
      Alert.alert("Check the date", "Choose today or a future start date.");
      return;
    }

    const firstOccurrence = new Date(startDate);
    firstOccurrence.setHours(
      scheduledTime.getHours(),
      scheduledTime.getMinutes(),
      0,
      0,
    );
    if (repeatType === "once" && firstOccurrence <= new Date()) {
      Alert.alert("Check the time", "Choose a future time for this reminder.");
      return;
    }

    setSaving(true);
    try {
      let permissionGranted = true;
      try {
        permissionGranted = await requestMedicationDosePermissions();
      } catch (error) {
        console.error("Could not request health reminder permissions:", error);
        Alert.alert(
          "Could not check notification access",
          "The reminder was not saved. Please try again.",
        );
        return;
      }

      try {
        await createHealthReminder(database, profileId, {
          metric,
          label: metric === "custom" ? customLabel.trim() : null,
          startDate: formatDate(startDate),
          scheduledTime: formatTime(scheduledTime),
          repeatType,
          repeatDays: repeatType === "weekly" ? [...repeatDays].sort() : [],
        });
      } catch (error) {
        console.error("Could not save health reminder:", error);
        Alert.alert("Could not save reminder", "Please try again.");
        return;
      }

      setMetric("blood_pressure");
      setCustomLabel("");
      setStartDate(new Date());
      setScheduledTime((current) => {
        const next = new Date(current);
        next.setHours(9, 0, 0, 0);
        return next;
      });
      setRepeatType("once");
      setRepeatDays([]);

      try {
        await refreshHealthReminderNotifications(database);
      } catch (error) {
        console.error("Health reminder saved but scheduling failed:", error);
        Alert.alert(
          "Reminder saved",
          "The reminder was saved, but its notification could not be scheduled. Reopen MediMate to try again.",
        );
      }
      try {
        const updatedReminders = await getHealthReminders(database, profileId);
        setReminders(updatedReminders);
        setLoadError(null);
      } catch (error) {
        console.error(
          "Reminder saved but the list could not be refreshed:",
          error,
        );
        setLoadError("Reminder saved. The list could not be refreshed.");
        Alert.alert(
          "Reminder saved",
          "The reminder was saved, but the list could not be refreshed.",
        );
      }
      if (!permissionGranted) {
        Alert.alert(
          "Notification permission is off",
          "The reminder was saved. Allow notifications in your device settings to receive it.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (reminder: HealthReminder) => {
    Alert.alert(
      "Delete reminder?",
      `Remove the reminder to measure ${getMetricName(reminder.metric, reminder.label)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!profileId) return;
            setDeletingId(reminder.id);
            try {
              await deleteHealthReminder(database, reminder.id, profileId);
            } catch (error) {
              console.error("Could not delete health reminder:", error);
              Alert.alert("Could not delete reminder", "Please try again.");
              setDeletingId(null);
              return;
            }

            try {
              const updatedReminders = await getHealthReminders(
                database,
                profileId,
              );
              setReminders(updatedReminders);
              setLoadError(null);
            } catch (error) {
              console.error(
                "Reminder deleted but the list could not be refreshed:",
                error,
              );
              setLoadError("Reminder deleted. The list could not be refreshed.");
              Alert.alert(
                "Reminder deleted",
                "The reminder was removed, but the list could not be refreshed.",
              );
            }

            try {
              await refreshHealthReminderNotifications(database);
            } catch (error) {
              console.error(
                "Reminder deleted but scheduled notifications could not be refreshed:",
                error,
              );
              Alert.alert(
                "Reminder deleted",
                "Its notification could not be refreshed. Reopen MediMate to try again.",
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  if (profileLoading || (profileId && loadedProfileId !== profileId)) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.status, { color: colors.textSecondary }]}>
          Loading health reminders...
        </Text>
      </SafeAreaView>
    );
  }

  if (!profileId) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.status, { color: colors.textSecondary }]}>
          Select a profile before creating health reminders.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.text }]}>
          Health reminders
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Choose a measurement, date, time, and optional weekly days for{" "}
          {activeProfile?.name ?? "this profile"}.
        </Text>

        {loadError ? (
          <Text style={[styles.error, { color: colors.danger }]}>
            {loadError}
          </Text>
        ) : null}

        <View
          style={[
            styles.formCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.label, { color: colors.text }]}>
            What should you measure?
          </Text>
          <View style={styles.options}>
            {HEALTH_METRICS.map((option) => (
              <Pressable
                key={option.type}
                accessibilityRole="button"
                accessibilityState={{ selected: metric === option.type }}
                onPress={() => setMetric(option.type)}
                style={[
                  styles.metricOption,
                  { borderColor: colors.border },
                  metric === option.type && {
                    backgroundColor: colors.accent,
                    borderColor: colors.accent,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.metricOptionText,
                    { color: colors.textSecondary },
                    metric === option.type && styles.selectedText,
                  ]}
                >
                  {option.name}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: metric === "custom" }}
              onPress={() => setMetric("custom")}
              style={[
                styles.metricOption,
                { borderColor: colors.border },
                metric === "custom" && {
                  backgroundColor: colors.accent,
                  borderColor: colors.accent,
                },
              ]}
            >
              <Text
                style={[
                  styles.metricOptionText,
                  { color: colors.textSecondary },
                  metric === "custom" && styles.selectedText,
                ]}
              >
                Other
              </Text>
            </Pressable>
          </View>

          {metric === "custom" ? (
            <TextInput
              accessibilityLabel="Custom health measurement"
              maxLength={80}
              onChangeText={setCustomLabel}
              placeholder="Measurement name"
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={customLabel}
            />
          ) : null}

          <Text style={[styles.label, { color: colors.text }]}>
            First reminder date
          </Text>
          {Platform.OS === "web" ? (
            <HealthReminderWebInput
              accessibilityLabel="First reminder date"
              backgroundColor={colors.background}
              borderColor={colors.border}
              color={colors.text}
              mode="date"
              onChangeText={(value) => {
                const date = parseDateInput(value);
                if (date) setStartDate(date);
              }}
              value={formatDate(startDate)}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPicker("date")}
              style={[
                styles.valueButton,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.valueText, { color: colors.text }]}>
                {startDate.toLocaleDateString()}
              </Text>
            </Pressable>
          )}

          <Text style={[styles.label, { color: colors.text }]}>Time</Text>
          {Platform.OS === "web" ? (
            <HealthReminderWebInput
              accessibilityLabel="Reminder time"
              backgroundColor={colors.background}
              borderColor={colors.border}
              color={colors.text}
              mode="time"
              onChangeText={(value) => {
                const time = parseTimeInput(value);
                if (time) setScheduledTime(time);
              }}
              value={formatTime(scheduledTime)}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPicker("time")}
              style={[
                styles.valueButton,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.valueText, { color: colors.text }]}>
                {scheduledTime.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
            </Pressable>
          )}

          <Text style={[styles.label, { color: colors.text }]}>
            Repeat
          </Text>
          <View style={styles.options}>
            {(["once", "weekly"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: repeatType === value }}
                onPress={() => {
                  setRepeatType(value);
                  if (value === "weekly" && repeatDays.length === 0) {
                    setRepeatDays([startDate.getDay()]);
                  }
                }}
                style={[
                  styles.repeatOption,
                  {
                    borderColor: colors.border,
                    backgroundColor:
                      repeatType === value
                        ? colors.accent
                        : colors.background,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.repeatOptionText,
                    {
                      color:
                        repeatType === value ? "#FFFFFF" : colors.textSecondary,
                    },
                  ]}
                >
                  {value === "once" ? "One time" : "Weekly"}
                </Text>
              </Pressable>
            ))}
          </View>

          {repeatType === "weekly" ? (
            <>
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                Select the days to repeat. Choose Saturday and Sunday for
                weekend reminders.
              </Text>
              <View style={styles.options}>
                {WEEKDAYS.map((day) => {
                  const selected = repeatDays.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setRepeatDays((current) =>
                          selected
                            ? current.filter((value) => value !== day.value)
                            : [...current, day.value],
                        )
                      }
                      style={[
                        styles.dayOption,
                        {
                          backgroundColor: selected
                            ? colors.accent
                            : colors.background,
                          borderColor: selected ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          {
                            color: selected ? "#FFFFFF" : colors.textSecondary,
                          },
                        ]}
                      >
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {picker && Platform.OS !== "web" ? (
            <View style={styles.pickerContainer}>
              <DateTimePicker
                display={
                  Platform.OS === "ios" ? "spinner" : "default"
                }
                mode={picker}
                onChange={handlePickerChange}
                value={picker === "date" ? startDate : scheduledTime}
              />
              {Platform.OS === "ios" ? (
                <Pressable
                  onPress={() => setPicker(null)}
                  style={styles.pickerDone}
                >
                  <Text style={[styles.pickerDoneText, { color: colors.accent }]}>
                    Done
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void handleSave()}
            style={[
              styles.saveButton,
              { backgroundColor: colors.accent },
              saving && styles.disabledButton,
            ]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? "Saving..." : "Save reminder"}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Your reminders
        </Text>
        {reminders.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No health reminders yet.
          </Text>
        ) : (
          reminders.map((reminder) => (
            <View
              key={reminder.id}
              style={[
                styles.reminderCard,
                {
                  backgroundColor: colors.backgroundElement,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.reminderInfo}>
                <Text style={[styles.reminderTitle, { color: colors.text }]}>
                  Measure {getMetricName(reminder.metric, reminder.label)}
                </Text>
                <Text
                  style={[
                    styles.reminderDescription,
                    { color: colors.textSecondary },
                  ]}
                >
                  {getRepeatDescription(reminder)} · {reminder.scheduledTime}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={deletingId === reminder.id}
                onPress={() => confirmDelete(reminder)}
                style={styles.deleteButton}
              >
                <Text style={[styles.deleteText, { color: colors.danger }]}>
                  {deletingId === reminder.id ? "Deleting..." : "Delete"}
                </Text>
              </Pressable>
            </View>
          ))
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/settings/notifications")}
          style={styles.settingsLink}
        >
          <Text style={[styles.settingsLinkText, { color: colors.accent }]}>
            Notification settings
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    marginTop: 6,
  },
  error: {
    fontSize: 14,
    marginBottom: 12,
  },
  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 15,
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricOption: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  metricOptionText: {
    fontSize: 12,
  },
  selectedText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 48,
    marginTop: 12,
    paddingHorizontal: 13,
  },
  valueButton: {
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 13,
  },
  valueText: {
    fontSize: 15,
  },
  repeatOption: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  repeatOptionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 9,
    marginTop: 12,
  },
  dayOption: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  dayText: {
    fontSize: 12,
    fontWeight: "600",
  },
  pickerContainer: {
    alignItems: "center",
    borderRadius: 12,
    marginTop: 12,
    padding: 8,
  },
  pickerDone: {
    padding: 10,
  },
  pickerDoneText: {
    fontWeight: "700",
  },
  saveButton: {
    alignItems: "center",
    borderRadius: 12,
    marginTop: 24,
    padding: 15,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 24,
  },
  emptyText: {
    fontSize: 14,
    paddingVertical: 10,
  },
  reminderCard: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 9,
    padding: 14,
  },
  reminderInfo: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  reminderDescription: {
    fontSize: 12,
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: "600",
  },
  settingsLink: {
    alignItems: "center",
    padding: 16,
  },
  settingsLinkText: {
    fontSize: 14,
    fontWeight: "700",
  },
  status: {
    padding: 24,
    textAlign: "center",
  },
});
