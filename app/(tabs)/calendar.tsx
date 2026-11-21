import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUserProfiles } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";

import {
  refreshAppointmentNotifications,
  requestAppointmentPermissions,
} from "@/services/appointmentNotifications";
import {
  addAppointment,
  deleteAppointment,
  getAppointmentsForMonth,
  getUpcomingAppointments,
  updateAppointment,
  type AppointmentInput,
} from "@/services/appointmentService";
import type { Appointment } from "@/types/appointment";

type PickerMode = "date" | "time";

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeKey(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseLocalDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatAppointmentTime(appointment: Appointment): string {
  return parseLocalDateTime(
    appointment.scheduledDate,
    appointment.scheduledTime,
  ).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatReminderTime(minutes: number): string {
  if (minutes === 1440) return "1 day before";
  if (minutes === 60) return "1 hour before";
  if (minutes % 1440 === 0) return `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} minutes before`;
}

function getCalendarDays(month: Date): Date[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const dayCount = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cellCount = Math.ceil((firstDay.getDay() + dayCount) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(1 - firstDay.getDay() + index);
    return date;
  });
}

function isUpcoming(appointment: Appointment, now: Date): boolean {
  const today = toDateKey(now);
  return (
    appointment.scheduledDate > today ||
    (appointment.scheduledDate === today &&
      appointment.scheduledTime >= toTimeKey(now))
  );
}

export default function CalendarScreen() {
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const colors = useTheme();
  const [month, setMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    Appointment[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAppointment, setEditingAppointment] =
    useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadAppointments = useCallback(async () => {
    if (!activeProfile) {
      setAppointments([]);
      setUpcomingAppointments([]);
      setLoading(false);
      return;
    }
    const requestId = ++loadGeneration.current;
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const now = new Date();

    setLoading(true);
    setLoadError(null);
    try {
      const [monthRecords, upcomingRecords] = await Promise.all([
        getAppointmentsForMonth(
          database,
          activeProfile.id,
          toDateKey(monthStart),
          toDateKey(monthEnd),
        ),
        getUpcomingAppointments(
          database,
          activeProfile.id,
          toDateKey(now),
          toTimeKey(now),
        ),
      ]);
      if (requestId !== loadGeneration.current) return;
      setAppointments(monthRecords);
      setUpcomingAppointments(upcomingRecords);
    } catch (error) {
      console.error("Error loading appointments:", error);
      if (requestId === loadGeneration.current) {
        setLoadError("Appointments could not be loaded.");
      }
    } finally {
      if (requestId === loadGeneration.current) setLoading(false);
    }
  }, [activeProfile, database, month]);

  useFocusEffect(
    useCallback(() => {
      void loadAppointments();
      return () => {
        loadGeneration.current += 1;
      };
    }, [loadAppointments]),
  );

  const calendarDays = useMemo(() => getCalendarDays(month), [month]);
  const appointmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const appointment of appointments) {
      counts.set(
        appointment.scheduledDate,
        (counts.get(appointment.scheduledDate) ?? 0) + 1,
      );
    }
    return counts;
  }, [appointments]);
  const selectedAppointments = appointments.filter(
    (appointment) => appointment.scheduledDate === toDateKey(selectedDate),
  );

  const changeMonth = (amount: number) => {
    const nextMonth = new Date(
      month.getFullYear(),
      month.getMonth() + amount,
      1,
    );
    setMonth(nextMonth);
    setSelectedDate(nextMonth);
  };

  const openNewAppointment = () => {
    setEditingAppointment(null);
    setEditorVisible(true);
  };

  const openEditAppointment = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    setEditorVisible(true);
  };

  const saveAppointment = async (input: AppointmentInput) => {
    if (saving) return;
    if (!activeProfile) {
      Alert.alert("Profile unavailable", "Please select a profile and try again.");
      return;
    }
    setSaving(true);
    let appointmentSaved = false;
    let notificationPermissionGranted = true;
    try {
      notificationPermissionGranted = await requestAppointmentPermissions();
      if (editingAppointment) {
        const updated = await updateAppointment(
          database,
          activeProfile.id,
          editingAppointment.id,
          input,
        );
        if (!updated) {
          Alert.alert(
            "Appointment not found",
            "This appointment may have been deleted.",
          );
          return;
        }
      } else {
        await addAppointment(database, activeProfile.id, input);
      }
      appointmentSaved = true;

      setEditorVisible(false);
      await refreshAppointmentNotifications(database);
      await loadAppointments();
      if (!notificationPermissionGranted) {
        Alert.alert(
          "Appointment saved, notifications are off",
          "Enable MediMate notifications and, on Android, allow exact alarms to receive appointment reminders on time.",
        );
      }
    } catch (error) {
      console.error("Error saving appointment:", error);
      if (appointmentSaved) {
        Alert.alert(
          "Appointment saved, but reminders could not be updated",
          "Please check your notification settings and try again.",
        );
      } else {
        Alert.alert(
          "Could not save appointment",
          "Please try again. Your appointment was not saved.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const removeAppointment = async (appointmentId: number) => {
    if (deletingId !== null) return;
    if (!activeProfile) return;
    setDeletingId(appointmentId);
    try {
      const deleted = await deleteAppointment(
        database,
        activeProfile.id,
        appointmentId,
      );
      if (!deleted) {
        Alert.alert(
          "Appointment not found",
          "This appointment may have already been deleted.",
        );
        return;
      }
      await refreshAppointmentNotifications(database);
      await loadAppointments();
    } catch (error) {
      console.error("Error deleting appointment:", error);
      Alert.alert(
        "Could not delete appointment",
        "Please try again. The appointment was not deleted.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDelete = (appointment: Appointment) => {
    Alert.alert(
      "Delete appointment?",
      `Remove "${appointment.title}" from your calendar?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void removeAppointment(appointment.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>
          YOUR SCHEDULE
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>Calendar</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Keep your appointments organized in one place.
        </Text>

        <View style={styles.monthHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => changeMonth(-1)}
            style={styles.monthArrow}
          >
            <Text style={styles.monthArrowText}>‹</Text>
          </Pressable>
          <Text style={[styles.monthTitle, { color: colors.text }]}>
            {formatMonthLabel(month)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => changeMonth(1)}
            style={styles.monthArrow}
          >
            <Text style={styles.monthArrowText}>›</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.calendarCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.weekdayRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((weekday, index) => (
              <Text
                key={`${weekday}-${index}`}
                style={[styles.weekday, { color: colors.textSecondary }]}
              >
                {weekday}
              </Text>
            ))}
          </View>
          <View style={styles.daysGrid}>
            {calendarDays.map((date) => {
              const dateKey = toDateKey(date);
              const isSelected = dateKey === toDateKey(selectedDate);
              const isCurrentMonth = date.getMonth() === month.getMonth();
              const isToday = dateKey === toDateKey(new Date());
              const count = appointmentCounts.get(dateKey) ?? 0;
              return (
                <Pressable
                  key={dateKey}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDateLabel(date)}${count ? `, ${count} appointments` : ""}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    setSelectedDate(date);
                    if (!isCurrentMonth) {
                      setMonth(
                        new Date(date.getFullYear(), date.getMonth(), 1),
                      );
                    }
                  }}
                  style={styles.dayCell}
                >
                  <View
                    style={[
                      styles.dayNumberWrap,
                      isSelected && styles.selectedDay,
                      isToday && !isSelected && styles.todayDay,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        { color: colors.text },
                        !isCurrentMonth && styles.outsideMonthDay,
                        isSelected && styles.selectedDayText,
                        isToday && !isSelected && styles.todayDayText,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.appointmentDot,
                      count === 0 && styles.hiddenAppointmentDot,
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Appointments
            </Text>
            <Text style={[styles.selectedDateText, { color: colors.textSecondary }]}>
              {formatDateLabel(selectedDate)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={openNewAppointment}
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        </View>

        {loadError ? (
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {loadError}
          </Text>
        ) : loading ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Loading appointments...
          </Text>
        ) : selectedAppointments.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.backgroundElement },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No appointments for this day
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Add an appointment to see it on your calendar.
            </Text>
          </View>
        ) : (
          selectedAppointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              deleting={deletingId === appointment.id}
              onEdit={() => openEditAppointment(appointment)}
              onDelete={() => confirmDelete(appointment)}
            />
          ))
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Coming up
        </Text>
        {loadError ? null : loading ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Loading upcoming appointments...
          </Text>
        ) : upcomingAppointments.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.backgroundElement },
            ]}
          >
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No upcoming appointments.
            </Text>
          </View>
        ) : (
          upcomingAppointments.map((appointment) => (
            <Pressable
              key={appointment.id}
              accessibilityRole="button"
              onPress={() => {
                const date = parseLocalDateTime(
                  appointment.scheduledDate,
                  appointment.scheduledTime,
                );
                setSelectedDate(date);
                setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
              }}
              style={[
                styles.upcomingCard,
                {
                  backgroundColor: colors.backgroundElement,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.upcomingDate}>
                <Text style={styles.upcomingMonth}>
                  {parseLocalDateTime(
                    appointment.scheduledDate,
                    appointment.scheduledTime,
                  ).toLocaleDateString(undefined, { month: "short" })}
                </Text>
                <Text style={styles.upcomingDay}>
                  {Number(appointment.scheduledDate.slice(-2))}
                </Text>
              </View>
              <View style={styles.upcomingDetails}>
                <Text
                  style={[styles.appointmentTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {appointment.title}
                </Text>
                <Text
                  style={[
                    styles.appointmentMeta,
                    { color: colors.textSecondary },
                  ]}
                >
                  {formatAppointmentTime(appointment)}
                  {appointment.location ? ` · ${appointment.location}` : ""}
                </Text>
              </View>
              <Text style={[styles.upcomingChevron, { color: colors.accent }]}>
                ›
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      {editorVisible ? (
        <AppointmentEditor
          key={editingAppointment?.id ?? "new-appointment"}
          appointment={editingAppointment}
          initialDate={selectedDate}
          saving={saving}
          onClose={() => setEditorVisible(false)}
          onSave={(input) => void saveAppointment(input)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function AppointmentCard({
  appointment,
  deleting,
  onEdit,
  onDelete,
}: {
  appointment: Appointment;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colors = useTheme();
  const upcoming = isUpcoming(appointment, new Date());
  return (
    <View
      style={[
        styles.appointmentCard,
        {
          backgroundColor: colors.backgroundElement,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.appointmentCardMain}>
        <View style={styles.appointmentTimeWrap}>
          <Text style={[styles.appointmentTime, { color: colors.accent }]}>
            {formatAppointmentTime(appointment)}
          </Text>
          {upcoming ? <Text style={styles.upcomingBadge}>Upcoming</Text> : null}
        </View>
        <Text style={[styles.appointmentTitle, { color: colors.text }]}>
          {appointment.title}
        </Text>
        {appointment.location ? (
          <Text
            style={[styles.appointmentMeta, { color: colors.textSecondary }]}
          >
            {appointment.location}
          </Text>
        ) : null}
        {appointment.reminderMinutes > 0 ? (
          <Text style={styles.appointmentMeta}>
            Reminder: {formatReminderTime(appointment.reminderMinutes)}
          </Text>
        ) : null}
      </View>
      <View style={styles.appointmentActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${appointment.title}`}
          onPress={onEdit}
          style={styles.actionButton}
        >
          <Text style={styles.editAction}>Edit</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${appointment.title}`}
          disabled={deleting}
          onPress={onDelete}
          style={styles.actionButton}
        >
          <Text style={styles.deleteAction}>{deleting ? "..." : "Delete"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AppointmentEditor({
  appointment,
  initialDate,
  saving,
  onClose,
  onSave,
}: {
  appointment: Appointment | null;
  initialDate: Date;
  saving: boolean;
  onClose: () => void;
  onSave: (input: AppointmentInput) => void;
}) {
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [location, setLocation] = useState(appointment?.location ?? "");
  const [dateTime, setDateTime] = useState(() =>
    appointment
      ? parseLocalDateTime(appointment.scheduledDate, appointment.scheduledTime)
      : initialDate,
  );
  const [reminderMinutes, setReminderMinutes] = useState(
    appointment?.reminderMinutes ?? 30,
  );
  const [activePicker, setActivePicker] = useState<PickerMode | null>(null);

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selectedValue?: Date,
  ) => {
    if (event.type === "dismissed") {
      setActivePicker(null);
      return;
    }
    if (selectedValue && activePicker) {
      const updatedDate = new Date(dateTime);
      if (activePicker === "date") {
        updatedDate.setFullYear(
          selectedValue.getFullYear(),
          selectedValue.getMonth(),
          selectedValue.getDate(),
        );
      } else {
        updatedDate.setHours(
          selectedValue.getHours(),
          selectedValue.getMinutes(),
          0,
          0,
        );
      }
      setDateTime(updatedDate);
    }
    if (Platform.OS !== "ios") setActivePicker(null);
  };

  const handleSave = () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      Alert.alert("Add a title", "Enter a title for this appointment.");
      return;
    }
    onSave({
      title: normalizedTitle,
      scheduledDate: toDateKey(dateTime),
      scheduledTime: toTimeKey(dateTime),
      location: location.trim(),
      reminderMinutes,
    });
  };

  const reminderOptions = [
    { value: 0, label: "None" },
    { value: 10, label: "10 min" },
    { value: 30, label: "30 min" },
    { value: 60, label: "1 hour" },
    { value: 1440, label: "1 day" },
  ];

  const dateLabel = dateTime.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = dateTime.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalBackdrop}
      >
        <Pressable style={styles.modalDismissArea} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>
              {appointment ? "Edit appointment" : "Add appointment"}
            </Text>
            <Text style={styles.label}>Title</Text>
            <TextInput
              accessibilityLabel="Appointment title"
              autoFocus
              maxLength={100}
              onChangeText={setTitle}
              placeholder="For example, Doctor visit"
              returnKeyType="next"
              style={styles.input}
              value={title}
            />
            <Text style={styles.label}>Date and time</Text>
            <View style={styles.dateTimeRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setActivePicker("date")}
                style={styles.dateTimeButton}
              >
                <Text style={styles.dateTimeCaption}>Date</Text>
                <Text style={styles.dateTimeValue}>{dateLabel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setActivePicker("time")}
                style={styles.dateTimeButton}
              >
                <Text style={styles.dateTimeCaption}>Time</Text>
                <Text style={styles.dateTimeValue}>{timeLabel}</Text>
              </Pressable>
            </View>
            {activePicker ? (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  mode={activePicker}
                  onChange={handlePickerChange}
                  value={dateTime}
                />
                {Platform.OS === "ios" ? (
                  <Pressable
                    onPress={() => setActivePicker(null)}
                    style={styles.pickerDone}
                  >
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.label}>Early reminder (optional)</Text>
            <View style={styles.reminderRow}>
              {reminderOptions.map((option) => {
                const selected = reminderMinutes === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setReminderMinutes(option.value)}
                    style={[
                      styles.reminderOption,
                      selected && styles.selectedReminderOption,
                    ]}
                  >
                    <Text
                      style={[
                        styles.reminderOptionText,
                        selected && styles.selectedReminderOptionText,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.reminderHelpText}>
              You will also be notified at the appointment time.
            </Text>
            <Text style={styles.label}>Location (optional)</Text>
            <TextInput
              accessibilityLabel="Appointment location"
              maxLength={120}
              onChangeText={setLocation}
              placeholder="Add a location"
              returnKeyType="done"
              style={styles.input}
              value={location}
            />
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={onClose}
                style={[styles.cancelButton, saving && styles.disabledButton]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={handleSave}
                style={[styles.saveButton, saving && styles.disabledButton]}
              >
                <Text style={styles.saveButtonText}>
                  {saving
                    ? "Saving..."
                    : appointment
                      ? "Save changes"
                      : "Save appointment"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7FAF9",
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    maxWidth: 800,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    color: "#247A65",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginTop: 10,
  },
  title: {
    color: "#173D35",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 6,
  },
  subtitle: {
    color: "#64748B",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 5,
    marginBottom: 22,
  },
  monthHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthArrow: {
    alignItems: "center",
    backgroundColor: "#E8F2EE",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  monthArrowText: {
    color: "#247A65",
    fontSize: 26,
    lineHeight: 30,
  },
  monthTitle: {
    color: "#173D35",
    fontSize: 18,
    fontWeight: "700",
  },
  calendarCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: 24,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  weekday: {
    color: "#82918D",
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    alignItems: "center",
    flexBasis: `${100 / 7}%`,
    height: 44,
    justifyContent: "center",
  },
  dayNumberWrap: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  dayNumber: {
    color: "#243B35",
    fontSize: 14,
    fontWeight: "500",
  },
  outsideMonthDay: {
    color: "#B7C2BE",
  },
  selectedDay: {
    backgroundColor: "#247A65",
  },
  selectedDayText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  todayDay: {
    borderColor: "#247A65",
    borderWidth: 1,
  },
  todayDayText: {
    color: "#247A65",
    fontWeight: "700",
  },
  appointmentDot: {
    backgroundColor: "#D47B35",
    borderRadius: 2,
    height: 4,
    marginTop: 2,
    width: 4,
  },
  hiddenAppointmentDot: {
    opacity: 0,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionHeading: {
    flex: 1,
  },
  sectionTitle: {
    color: "#173D35",
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 8,
  },
  selectedDateText: {
    color: "#64748B",
    fontSize: 13,
  },
  addButton: {
    backgroundColor: "#247A65",
    borderRadius: 12,
    marginLeft: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    color: "#B04444",
    fontSize: 14,
    marginVertical: 12,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
  },
  emptyTitle: {
    color: "#243B35",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 5,
  },
  emptyText: {
    color: "#82918D",
    fontSize: 14,
    lineHeight: 20,
    marginVertical: 10,
  },
  appointmentCard: {
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    padding: 15,
  },
  appointmentCardMain: {
    flex: 1,
    paddingRight: 8,
  },
  appointmentTimeWrap: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 6,
  },
  appointmentTime: {
    color: "#247A65",
    fontSize: 13,
    fontWeight: "700",
  },
  upcomingBadge: {
    backgroundColor: "#E8F2EE",
    borderRadius: 8,
    color: "#247A65",
    fontSize: 10,
    fontWeight: "700",
    marginLeft: 8,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  appointmentTitle: {
    color: "#243B35",
    fontSize: 15,
    fontWeight: "700",
  },
  appointmentMeta: {
    color: "#71817C",
    fontSize: 13,
    marginTop: 4,
  },
  appointmentActions: {
    alignItems: "flex-end",
    flexDirection: "row",
  },
  actionButton: {
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  editAction: {
    color: "#247A65",
    fontSize: 12,
    fontWeight: "700",
  },
  deleteAction: {
    color: "#B04444",
    fontSize: 12,
    fontWeight: "700",
  },
  upcomingCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E4ECE8",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 12,
  },
  upcomingDate: {
    alignItems: "center",
    backgroundColor: "#E8F2EE",
    borderRadius: 10,
    justifyContent: "center",
    marginRight: 12,
    minHeight: 52,
    width: 52,
  },
  upcomingMonth: {
    color: "#247A65",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  upcomingDay: {
    color: "#173D35",
    fontSize: 18,
    fontWeight: "700",
  },
  upcomingDetails: {
    flex: 1,
  },
  upcomingChevron: {
    color: "#82918D",
    fontSize: 24,
    marginLeft: 8,
  },
  modalBackdrop: {
    backgroundColor: "rgba(12, 31, 26, 0.42)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: "#F7FAF9",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
  },
  modalHandle: {
    alignSelf: "center",
    backgroundColor: "#CAD5D0",
    borderRadius: 3,
    height: 5,
    marginTop: 10,
    width: 42,
  },
  modalContent: {
    padding: 20,
    paddingBottom: 28,
  },
  modalTitle: {
    color: "#173D35",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
  },
  label: {
    color: "#344943",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 14,
  },
  reminderHelpText: {
    color: "#71817C",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 12,
    borderWidth: 1,
    color: "#243B35",
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: 10,
  },
  dateTimeButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateTimeCaption: {
    color: "#82918D",
    fontSize: 11,
    marginBottom: 4,
  },
  dateTimeValue: {
    color: "#243B35",
    fontSize: 14,
    fontWeight: "600",
  },
  pickerContainer: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginTop: 10,
    overflow: "hidden",
  },
  pickerDone: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pickerDoneText: {
    color: "#247A65",
    fontWeight: "700",
  },
  reminderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reminderOption: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  selectedReminderOption: {
    backgroundColor: "#247A65",
    borderColor: "#247A65",
  },
  reminderOptionText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  selectedReminderOptionText: {
    color: "#FFFFFF",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: "#E8F2EE",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  cancelButtonText: {
    color: "#247A65",
    fontSize: 14,
    fontWeight: "700",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#247A65",
    borderRadius: 12,
    flex: 1.5,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
});
