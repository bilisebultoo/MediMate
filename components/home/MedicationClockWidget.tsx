import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useUserProfiles } from "@/context/UserContext";

type UpcomingDose = {
  id: number;
  medicine_id: number;
  name: string;
  dose: string;
  scheduled_date: string;
  scheduled_time: string;
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

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return time;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;

  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatDoseDate(date: string, today: string): string {
  if (date === today) return "Today";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date === formatLocalDate(tomorrow)) return "Tomorrow";

  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function MedicationClockWidget() {
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const router = useRouter();

  const [clockNow, setClockNow] = useState(new Date());
  const [upcomingDoses, setUpcomingDoses] = useState<UpcomingDose[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Update the clock every second.
  useEffect(() => {
    const interval = setInterval(() => {
      setClockNow(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Load real upcoming medication schedules.
  const loadUpcomingDoses = useCallback(async () => {
    if (!activeProfile) {
      setUpcomingDoses([]);
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
      const today = formatLocalDate(now);
      const currentTime = formatLocalTime(now);

      const results = await database.getAllAsync<UpcomingDose>(
        `SELECT
           h.id,
           h.medicine_id,
           m.name,
           m.dose,
           h.scheduled_date,
           h.scheduled_time
         FROM medication_history h
         INNER JOIN medicines m ON m.id = h.medicine_id
         WHERE h.user_id = ?
           AND h.status = 'PENDING'
           AND m.status = 'ACTIVE'
           AND (
             h.scheduled_date > ?
             OR (
               h.scheduled_date = ?
               AND h.scheduled_time >= ?
             )
           )
         ORDER BY
           h.scheduled_date ASC,
           h.scheduled_time ASC,
           h.id ASC
         LIMIT 3`,
        activeProfile.id,
        today,
        today,
        currentTime,
      );

      setUpcomingDoses(results);
      setLoadError(false);
    } catch (error) {
      console.error("Error loading upcoming medication doses:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, database]);

  // Refresh when Home becomes active and periodically afterward.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const refresh = async () => {
        if (isActive) {
          await loadUpcomingDoses();
        }
      };

      void refresh();

      const interval = setInterval(() => {
        void refresh();
      }, 15000);

      return () => {
        isActive = false;
        clearInterval(interval);
      };
    }, [loadUpcomingDoses]),
  );

  const hour = clockNow.getHours();
  const minute = clockNow.getMinutes();
  const second = clockNow.getSeconds();

  // Calculate analog clock hand positions.
  const hourRotation = (hour % 12) * 30 + minute * 0.5;
  const minuteRotation = minute * 6 + second * 0.1;
  const secondRotation = second * 6;

  const currentTimeText = clockNow.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const currentDateText = clockNow.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const nextDose = upcomingDoses[0];

  return (
    <View style={styles.widget}>
      <View style={styles.topRow}>
        <View style={styles.clockInfo}>
          <Text style={styles.eyebrow}>MEDICATION REMINDER</Text>

          <Text style={styles.clockTime}>{currentTimeText}</Text>

          <Text style={styles.dateText}>{currentDateText}</Text>

          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE CLOCK</Text>
          </View>
        </View>

        <View style={styles.analogClock}>
          {[12, 3, 6, 9].map((number) => (
            <Text
              key={number}
              style={[
                styles.clockNumber,
                number === 12
                  ? styles.numberTop
                  : number === 3
                    ? styles.numberRight
                    : number === 6
                      ? styles.numberBottom
                      : styles.numberLeft,
              ]}
            >
              {number}
            </Text>
          ))}

          <View
            style={[
              styles.hourHand,
              { transform: [{ rotate: `${hourRotation}deg` }] },
            ]}
          />

          <View
            style={[
              styles.minuteHand,
              { transform: [{ rotate: `${minuteRotation}deg` }] },
            ]}
          />

          <View
            style={[
              styles.secondHand,
              { transform: [{ rotate: `${secondRotation}deg` }] },
            ]}
          />

          <View style={styles.clockCenter} />
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.reminderHeading}>
        <View>
          <Text style={styles.reminderTitle}>Your next reminders</Text>
          <Text style={styles.reminderSubtitle}>
            Your upcoming medication schedule
          </Text>
        </View>

        <Text style={styles.pillIcon}>💊</Text>
      </View>

      {loading ? (
        <Text style={styles.emptyText}>Loading your schedule...</Text>
      ) : loadError ? (
        <Text style={styles.emptyText}>
          Unable to load medication reminders. Please try again.
        </Text>
      ) : upcomingDoses.length === 0 ? (
        <View style={styles.emptyReminder}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>You're all caught up!</Text>
          <Text style={styles.emptyText}>
            No upcoming pending medication doses were found.
          </Text>
        </View>
      ) : (
        <View style={styles.doseList}>
          {upcomingDoses.map((dose, index) => (
            <Pressable
              key={dose.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${dose.name} medicine details`}
              onPress={() =>
                router.push({
                  pathname: "/medication/[id]",
                  params: { id: String(dose.medicine_id) },
                })
              }
              style={[styles.doseCard, index === 0 && styles.firstDoseCard]}
            >
              <View style={styles.doseTimeBox}>
                <Text style={styles.doseTime}>
                  {formatTime(dose.scheduled_time)}
                </Text>
                <Text style={styles.doseDate}>
                  {formatDoseDate(
                    dose.scheduled_date,
                    formatLocalDate(clockNow),
                  )}
                </Text>
              </View>

              <View style={styles.doseInfo}>
                <Text style={styles.doseName} numberOfLines={1}>
                  {dose.name}
                </Text>
                <Text style={styles.doseAmount} numberOfLines={1}>
                  {dose.dose}
                </Text>
              </View>

              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.footerText}>
        Stay consistent with your medication schedule.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  widget: {
    backgroundColor: "#EAF4FF",
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#D6E8FA",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clockInfo: {
    flex: 1,
    marginRight: 8,
  },
  eyebrow: {
    color: "#527AA5",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  clockTime: {
    color: "#183F68",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 9,
  },
  dateText: {
    color: "#62809F",
    fontSize: 11,
    marginTop: 5,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#D6EAFB",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 11,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#2795D2",
    marginRight: 6,
  },
  liveText: {
    color: "#286B9F",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  analogClock: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "#FFFFFF",
    borderWidth: 5,
    borderColor: "#D1E6FA",
    justifyContent: "center",
    alignItems: "center",
  },
  clockNumber: {
    position: "absolute",
    color: "#527AA5",
    fontSize: 10,
    fontWeight: "700",
  },
  numberTop: {
    top: 7,
  },
  numberRight: {
    right: 8,
  },
  numberBottom: {
    bottom: 7,
  },
  numberLeft: {
    left: 8,
  },
  hourHand: {
    position: "absolute",
    width: 4,
    height: 27,
    borderRadius: 4,
    backgroundColor: "#183F68",
    top: 25,
    left: 49,
    transformOrigin: "bottom",
  },
  minuteHand: {
    position: "absolute",
    width: 3,
    height: 36,
    borderRadius: 4,
    backgroundColor: "#3186C4",
    top: 16,
    left: 50,
    transformOrigin: "bottom",
  },
  secondHand: {
    position: "absolute",
    width: 1.5,
    height: 39,
    backgroundColor: "#E36B70",
    top: 13,
    left: 50.75,
    transformOrigin: "bottom",
  },
  clockCenter: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#183F68",
  },
  divider: {
    height: 1,
    backgroundColor: "#D3E5F6",
    marginVertical: 17,
  },
  reminderHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  reminderTitle: {
    color: "#183F68",
    fontSize: 15,
    fontWeight: "800",
  },
  reminderSubtitle: {
    color: "#6A87A5",
    fontSize: 11,
    marginTop: 4,
  },
  pillIcon: {
    fontSize: 23,
  },
  doseList: {
    gap: 8,
  },
  doseCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DCEAF7",
  },
  firstDoseCard: {
    borderColor: "#8DBFE8",
    backgroundColor: "#F8FCFF",
  },
  doseTimeBox: {
    minWidth: 78,
    backgroundColor: "#EAF4FF",
    padding: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  doseTime: {
    color: "#245D91",
    fontSize: 12,
    fontWeight: "800",
  },
  doseDate: {
    color: "#6B89A8",
    fontSize: 9,
    marginTop: 3,
  },
  doseInfo: {
    flex: 1,
    marginLeft: 11,
  },
  doseName: {
    color: "#244665",
    fontSize: 13,
    fontWeight: "700",
  },
  doseAmount: {
    color: "#7890A7",
    fontSize: 11,
    marginTop: 4,
  },
  arrow: {
    color: "#5595C8",
    fontSize: 25,
    marginLeft: 5,
  },
  emptyReminder: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 17,
    alignItems: "center",
  },
  emptyIcon: {
    color: "#319A79",
    fontSize: 25,
    fontWeight: "800",
  },
  emptyTitle: {
    color: "#244665",
    fontWeight: "700",
    fontSize: 13,
    marginTop: 6,
  },
  emptyText: {
    color: "#7890A7",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 7,
  },
  footerText: {
    color: "#7890A7",
    fontSize: 10,
    textAlign: "center",
    marginTop: 13,
  },
});
