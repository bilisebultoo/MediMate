import { useUserProfiles } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";
import { getUpcomingAppointments } from "@/services/appointmentService";
import { refreshMedicationDoseNotifications } from "@/services/medicationDoseNotifications";
import {
  markExpiredMedicationDoses,
  markMedicationDoseTaken,
} from "@/services/medicationDoseStatus";
import { generateMedicationSchedules } from "@/services/medicationScheduleGenerator";
import type { Appointment } from "@/types/appointment";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
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

type HomeDose = {
  id: number;
  name: string;
  dose: string;
  scheduled_time: string;
  status: "PENDING" | "TAKEN" | "MISSED";
};

type MedicineCount = {
  count: number;
};

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

function parseAppointmentDate(appointment: Appointment): Date {
  const [year, month, day] = appointment.scheduledDate.split("-").map(Number);
  const [hours, minutes] = appointment.scheduledTime.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function formatAppointmentTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatScheduledTime(time: string): string {
  const [hourValue, minuteValue] = time.split(":").map(Number);

  if (
    !Number.isInteger(hourValue) ||
    !Number.isInteger(minuteValue) ||
    hourValue < 0 ||
    hourValue > 23 ||
    minuteValue < 0 ||
    minuteValue > 59
  ) {
    return time;
  }

  const suffix = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;

  return `${hour}:${String(minuteValue).padStart(2, "0")} ${suffix}`;
}

export default function HomeScreen() {
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const colors = useTheme();

  const [doses, setDoses] = useState<HomeDose[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentLoadError, setAppointmentLoadError] = useState(false);
  const [totalMedicines, setTotalMedicines] = useState(0);
  const [savingDoseId, setSavingDoseId] = useState<number | null>(null);

  const loadDashboard = useCallback(
    async (ensureSchedules: boolean, isCurrent: () => boolean) => {
      if (!activeProfile) return;

      const userId = activeProfile.id;
      const now = new Date();

      try {
        const upcomingAppointments = await getUpcomingAppointments(
          database,
          userId,
          formatLocalDate(now),
          formatLocalTime(now),
        );

        if (isCurrent()) {
          setAppointments(upcomingAppointments);
          setAppointmentLoadError(false);
        }
      } catch (error) {
        console.error("Error loading upcoming appointments:", error);

        if (isCurrent()) {
          setAppointmentLoadError(true);
        }
      }

      try {
        if (ensureSchedules) {
          await generateMedicationSchedules(database);
        }

        const expiredCount = await markExpiredMedicationDoses(database);

        if (expiredCount > 0) {
          try {
            await refreshMedicationDoseNotifications(database);
          } catch (error) {
            console.error(
              "Error refreshing reminders after doses expired:",
              error,
            );
          }
        }

        const today = formatLocalDate(now);

        const [todayDoses, medicineCount] = await Promise.all([
          database.getAllAsync<HomeDose>(
            `SELECT h.id, m.name, m.dose, h.scheduled_time, h.status
             FROM medication_history h
             JOIN medicines m ON m.id = h.medicine_id
             WHERE h.user_id = ? AND h.scheduled_date = ?
             ORDER BY h.scheduled_time, h.id`,
            userId,
            today,
          ),

          database.getFirstAsync<MedicineCount>(
            "SELECT COUNT(*) AS count FROM medicines WHERE user_id = ?",
            userId,
          ),
        ]);

        if (isCurrent()) {
          setDoses(todayDoses);
          setTotalMedicines(medicineCount?.count ?? 0);
        }
      } catch (error) {
        console.error("Error loading today's medication doses:", error);
      }
    },
    [activeProfile, database],
  );

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;

      const refresh = (ensureSchedules = false) => {
        void loadDashboard(ensureSchedules, () => isCurrent);
      };

      refresh(true);

      const interval = setInterval(() => refresh(), 15_000);

      return () => {
        isCurrent = false;
        clearInterval(interval);
      };
    }, [loadDashboard]),
  );

  const handleConfirmTaken = async (doseId: number) => {
    if (savingDoseId !== null || !activeProfile) return;

    setSavingDoseId(doseId);

    try {
      const confirmed = await markMedicationDoseTaken(
        database,
        doseId,
        activeProfile.id,
      );

      await loadDashboard(false, () => true);

      if (!confirmed) {
        Alert.alert(
          "Dose is no longer pending",
          "It may have already been marked as missed.",
        );
        return;
      }

      try {
        await refreshMedicationDoseNotifications(database);
      } catch (error) {
        console.error(
          "Error refreshing reminders after confirming a dose:",
          error,
        );

        Alert.alert(
          "Dose saved, reminders not refreshed",
          "The dose was marked as taken, but upcoming reminders could not be refreshed.",
        );
      }
    } catch (error) {
      console.error("Error confirming medication dose:", error);

      Alert.alert(
        "Could not confirm dose",
        "Please try again. The dose will remain pending until it is confirmed.",
      );
    } finally {
      setSavingDoseId(null);
    }
  };

  const today = new Date();

  const dateText = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const hour = today.getHours();

  const greeting =
    hour < 12
      ? "Good morning!"
      : hour < 17
        ? "Good afternoon!"
        : "Good evening!";

  const userFirstName = activeProfile?.name
    ? activeProfile.name.trim().split(/\s+/)[0]
    : "";

  const takenDoses = doses.filter((dose) => dose.status === "TAKEN");
  const pendingDoses = doses.filter((dose) => dose.status === "PENDING");
  const missedDoses = doses.filter((dose) => dose.status === "MISSED");

  return (
    <ImageBackground
      source={require("../../assets/images/medicines-background.jpg")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      {/* Expo StatusBar: translucent prop removed */}
      <StatusBar style="dark" />

      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "left", "right", "bottom"]}
      >
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {/* Home Screen Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.text }]}>
                {greeting}
              </Text>

              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {userFirstName
                  ? `Welcome, ${userFirstName}`
                  : "Welcome to MediMate"}
              </Text>

              <Text style={[styles.date, { color: colors.textSecondary }]}>
                {dateText}
              </Text>
            </View>

            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {userFirstName ? userFirstName.charAt(0).toUpperCase() : "U"}
              </Text>
            </View>
          </View>

          {/* Today's Overview */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Today&apos;s Overview
          </Text>

          <View style={styles.statsGrid}>
            <StatCard
              title="Total Medicines"
              value={String(totalMedicines)}
              icon="💊"
              background="#E8F5EE"
              color="#287A58"
            />

            <StatCard
              title="Taken Doses"
              value={String(takenDoses.length)}
              icon="✓"
              background="#EAF0FF"
              color="#4566B2"
            />

            <StatCard
              title="Pending Doses"
              value={String(pendingDoses.length)}
              icon="⏰"
              background="#FFF4E5"
              color="#B77924"
            />

            <StatCard
              title="Missed Doses"
              value={String(missedDoses.length)}
              icon="!"
              background="#FCECEC"
              color="#C05252"
            />
          </View>

          {/* Today's Doses */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Today&apos;s Doses
            </Text>

            <Text style={[styles.viewAll, { color: colors.textSecondary }]}>
              {doses.length} doses
            </Text>
          </View>

          <DoseSection
            title="Pending Doses"
            doses={pendingDoses}
            emptyMessage="No pending doses for today."
            onConfirmTaken={handleConfirmTaken}
            savingDoseId={savingDoseId}
          />

          <DoseSection
            title="Taken Doses"
            doses={takenDoses}
            emptyMessage="No doses confirmed yet."
          />

          <DoseSection
            title="Missed Doses"
            doses={missedDoses}
            emptyMessage="No missed doses today."
          />

          {/* Upcoming Appointments */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Upcoming Appointments
          </Text>

          {appointmentLoadError ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.backgroundElement },
              ]}
            >
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Upcoming appointments could not be loaded
              </Text>

              <Text
                style={[
                  styles.emptyDescription,
                  { color: colors.textSecondary },
                ]}
              >
                Please try again in a moment.
              </Text>
            </View>
          ) : appointments.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.backgroundElement },
              ]}
            >
              <Text style={styles.emptyIcon}>📅</Text>

              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No upcoming appointments
              </Text>

              <Text
                style={[
                  styles.emptyDescription,
                  { color: colors.textSecondary },
                ]}
              >
                Your doctor and hospital appointments will appear here.
              </Text>
            </View>
          ) : (
            appointments.map((appointment) => {
              const date = parseAppointmentDate(appointment);

              return (
                <View
                  key={appointment.id}
                  style={[
                    styles.appointmentCard,
                    {
                      backgroundColor: colors.backgroundElement,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.appointmentDate}>
                    <Text style={styles.appointmentMonth}>
                      {date.toLocaleDateString(undefined, {
                        month: "short",
                      })}
                    </Text>

                    <Text style={styles.appointmentDay}>{date.getDate()}</Text>
                  </View>

                  <View style={styles.appointmentInfo}>
                    <Text
                      style={[styles.appointmentName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {appointment.title}
                    </Text>

                    <Text
                      style={[
                        styles.appointmentDetails,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {date.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      {" · "}
                      {formatAppointmentTime(date)}
                    </Text>

                    {appointment.location ? (
                      <Text
                        style={[
                          styles.appointmentDetails,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {appointment.location}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}

          {/* Health Reminders */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Health Reminders
          </Text>

          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.backgroundElement },
            ]}
          >
            <Text style={styles.emptyIcon}>❤️</Text>

            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Stay on top of your health
            </Text>

            <Text
              style={[styles.emptyDescription, { color: colors.textSecondary }]}
            >
              Your health tracking reminders will appear here.
            </Text>
          </View>

          {/* Footer */}
          <Text style={[styles.footer, { color: colors.textSecondary }]}>
            MediMate • Where Your health is organized.
          </Text>
        </ScrollView>

        {/* MediMate AI Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open MediMate AI"
          onPress={() => router.push("/ai")}
          style={[styles.aiButton, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.aiButtonText}>✦</Text>
        </Pressable>
      </SafeAreaView>
    </ImageBackground>
  );
}

function StatCard({
  title,
  value,
  icon,
  background,
  color,
}: {
  title: string;
  value: string;
  icon: string;
  background: string;
  color: string;
}) {
  const colors = useTheme();

  return (
    <View style={[styles.statCard, { backgroundColor: background }]}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );
}

function DoseSection({
  title,
  doses,
  emptyMessage,
  onConfirmTaken,
  savingDoseId,
}: {
  title: string;
  doses: HomeDose[];
  emptyMessage: string;
  onConfirmTaken?: (doseId: number) => void;
  savingDoseId?: number | null;
}) {
  const colors = useTheme();

  return (
    <View style={styles.doseSection}>
      <Text style={[styles.doseSectionTitle, { color: colors.text }]}>
        {title}
      </Text>

      {doses.length === 0 ? (
        <View
          style={[
            styles.emptyDoseCard,
            { backgroundColor: colors.backgroundElement },
          ]}
        >
          <Text
            style={[styles.emptyDescription, { color: colors.textSecondary }]}
          >
            {emptyMessage}
          </Text>
        </View>
      ) : (
        doses.map((dose) => (
          <View
            key={dose.id}
            style={[
              styles.medicineCard,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.medicineHeader}>
              <View style={styles.medicineIconContainer}>
                <Text style={styles.medicineIcon}>💊</Text>
              </View>

              <View style={styles.medicineInfo}>
                <Text style={[styles.medicineName, { color: colors.text }]}>
                  {dose.name}
                </Text>

                <Text
                  style={[styles.medicineDose, { color: colors.textSecondary }]}
                >
                  {dose.dose} · {formatScheduledTime(dose.scheduled_time)}
                </Text>
              </View>

              {onConfirmTaken ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm ${dose.name} as taken`}
                  disabled={savingDoseId === dose.id}
                  onPress={() => onConfirmTaken(dose.id)}
                  style={[
                    styles.confirmButton,
                    savingDoseId === dose.id && styles.disabledButton,
                  ]}
                >
                  <Text style={styles.confirmButtonText}>
                    {savingDoseId === dose.id ? "Saving..." : "Confirm taken"}
                  </Text>
                </Pressable>
              ) : (
                <View
                  style={[
                    styles.statusBadge,
                    dose.status === "TAKEN"
                      ? styles.takenBadge
                      : dose.status === "MISSED"
                        ? styles.missedBadge
                        : styles.skippedBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      dose.status === "TAKEN"
                        ? styles.takenText
                        : dose.status === "MISSED"
                          ? styles.missedText
                          : styles.skippedText,
                    ]}
                  >
                    {dose.status}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backgroundImage: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
    marginTop: 10,
  },
  greeting: {
    fontSize: 27,
    fontWeight: "bold",
    color: "#173D35",
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
    marginTop: 6,
  },
  date: {
    fontSize: 13,
    color: "#82918D",
    marginTop: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#D9EEE5",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#247A65",
  },
  aiButton: {
    alignItems: "center",
    borderRadius: 30,
    bottom: 20,
    elevation: 5,
    height: 60,
    justifyContent: "center",
    position: "absolute",
    right: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    width: 60,
  },
  aiButtonText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#173D35",
    marginBottom: 14,
    marginTop: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statCard: {
    width: "48%",
    padding: 16,
    borderRadius: 16,
    marginBottom: 13,
  },
  statIcon: {
    fontSize: 23,
    marginBottom: 10,
  },
  statValue: {
    fontSize: 27,
    fontWeight: "bold",
  },
  statTitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 5,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  viewAll: {
    color: "#247A65",
    fontSize: 13,
    fontWeight: "600",
  },
  doseSection: {
    marginBottom: 8,
  },
  doseSectionTitle: {
    color: "#527269",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 9,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EDF1EF",
  },
  emptyDoseCard: {
    backgroundColor: "#FFFFFF",
    padding: 15,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EDF1EF",
  },
  emptyIcon: {
    fontSize: 30,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#263F38",
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 13,
    color: "#82918D",
    textAlign: "center",
    lineHeight: 20,
  },
  appointmentCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#EDF1EF",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 12,
  },
  appointmentDate: {
    alignItems: "center",
    backgroundColor: "#E8F5EE",
    borderRadius: 10,
    justifyContent: "center",
    marginRight: 12,
    minHeight: 52,
    width: 52,
  },
  appointmentMonth: {
    color: "#287A65",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  appointmentDay: {
    color: "#173D35",
    fontSize: 18,
    fontWeight: "700",
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentName: {
    color: "#243B35",
    fontSize: 15,
    fontWeight: "700",
  },
  appointmentDetails: {
    color: "#71817C",
    fontSize: 13,
    marginTop: 4,
  },
  medicineCard: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EDF1EF",
  },
  medicineHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  medicineIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#E8F5EE",
    justifyContent: "center",
    alignItems: "center",
  },
  medicineIcon: {
    fontSize: 22,
  },
  medicineInfo: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },
  medicineName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#173D35",
  },
  medicineDose: {
    fontSize: 12,
    color: "#82918D",
    marginTop: 5,
  },
  confirmButton: {
    backgroundColor: "#287A65",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 15,
  },
  takenBadge: {
    backgroundColor: "#E5F3EB",
  },
  missedBadge: {
    backgroundColor: "#FCECEC",
  },
  skippedBadge: {
    backgroundColor: "#EEF0F2",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  takenText: {
    color: "#287A65",
  },
  missedText: {
    color: "#C05252",
  },
  skippedText: {
    color: "#64748B",
  },
  footer: {
    textAlign: "center",
    color: "#94A3A0",
    fontSize: 12,
    marginTop: 20,
  },
});
