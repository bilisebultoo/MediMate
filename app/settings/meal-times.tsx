import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { regeneratePendingMealSchedules } from "@/services/medicationScheduleGenerator";
import { refreshMedicationDoseNotifications } from "@/services/medicationDoseNotifications";
import { useUserProfiles } from "@/context/UserContext";
import {
  DEFAULT_MEAL_TIMES,
  formatTime,
  MEAL_NAMES,
  parseMealTime,
  type MealName,
  type MealTimes,
} from "@/utils/mealTimes";

type MealSettingsRecord = {
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
};

export default function MealTimesScreen() {
  const router = useRouter();
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const [mealTimes, setMealTimes] = useState<MealTimes>(DEFAULT_MEAL_TIMES);
  const [activePicker, setActivePicker] = useState<MealName | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadMealTimes() {
        if (!activeProfile) return;
        setLoading(true);
        try {
          const settings = await database.getFirstAsync<MealSettingsRecord>(
            `SELECT breakfast_time, lunch_time, dinner_time
             FROM meal_settings WHERE user_id = ?`,
            activeProfile.id,
          );
          if (isActive && settings) {
            setMealTimes({
              Breakfast: settings.breakfast_time,
              Lunch: settings.lunch_time,
              Dinner: settings.dinner_time,
            });
          }
        } catch (error) {
          console.error("Error loading meal times:", error);
          if (isActive) {
            Alert.alert(
              "Could not load meal times",
              "Please try opening this screen again.",
            );
          }
        } finally {
          if (isActive) setLoading(false);
        }
      }

      loadMealTimes();
      return () => {
        isActive = false;
      };
    }, [activeProfile, database]),
  );

  const handleTimeChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type === "dismissed") {
      setActivePicker(null);
      return;
    }

    if (selectedDate && activePicker) {
      setMealTimes((previous) => ({
        ...previous,
        [activePicker]: formatTime(selectedDate),
      }));
    }

    if (Platform.OS !== "ios") setActivePicker(null);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!activeProfile) {
      Alert.alert("Profile unavailable", "Please select a profile and try again.");
      return;
    }

    setSaving(true);
    try {
      try {
        await database.runAsync(
          `INSERT INTO meal_settings (
            user_id, breakfast_time, lunch_time, dinner_time, updated_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            breakfast_time = excluded.breakfast_time,
            lunch_time = excluded.lunch_time,
            dinner_time = excluded.dinner_time,
            updated_at = excluded.updated_at`,
          activeProfile.id,
          mealTimes.Breakfast,
          mealTimes.Lunch,
          mealTimes.Dinner,
          new Date().toISOString(),
        );
      } catch (error) {
        console.error("Error saving meal times:", error);
        Alert.alert(
          "Could not save meal times",
          "Please try again.",
        );
        return;
      }

      try {
        await regeneratePendingMealSchedules(database);
        await refreshMedicationDoseNotifications(database);
      } catch (error) {
        console.error("Error updating doses after meal-time change:", error);
        Alert.alert(
          "Meal times saved, doses not updated",
          "Your meal times were saved, but upcoming doses and reminders could not be updated.",
        );
        return;
      }

      Alert.alert("Meal times saved", "Your meal times have been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#287A65" />
          <Text style={styles.description}>Loading meal times...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pickerValue = activePicker
    ? (parseMealTime(mealTimes[activePicker]) ?? new Date())
    : new Date();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Settings</Text>
        </Pressable>

        <Text style={styles.title}>Meal Times</Text>
        <Text style={styles.description}>
          Set the usual time for each meal. Meal-based medicine reminders use
          these times. Upcoming notifications refresh when MediMate opens.
        </Text>

        {MEAL_NAMES.map((meal) => (
          <View key={meal} style={styles.mealCard}>
            <Text style={styles.mealName}>{meal}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setActivePicker(meal)}
              style={styles.timeButton}
            >
              <Text style={styles.timeText}>{mealTimes[meal]}</Text>
              <Text style={styles.editText}>Change</Text>
            </Pressable>

            {activePicker === meal && (
              <View style={styles.picker}>
                <DateTimePicker
                  value={pickerValue}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={handleTimeChange}
                  is24Hour={false}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    style={styles.doneButton}
                    onPress={() => setActivePicker(null)}
                  >
                    <Text style={styles.doneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))}

        <Pressable
          style={[styles.saveButton, saving && styles.disabledButton]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveText}>
            {saving ? "Saving..." : "Save Meal Times"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  back: {
    color: "#287A65",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 20,
  },
  title: {
    fontSize: 25,
    fontWeight: "bold",
    color: "#172554",
  },
  description: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 20,
  },
  mealCard: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  mealName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 12,
  },
  timeButton: {
    minHeight: 50,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeText: {
    fontSize: 16,
    color: "#173D35",
  },
  editText: {
    color: "#287A65",
    fontWeight: "600",
  },
  picker: {
    marginTop: 12,
  },
  doneButton: {
    backgroundColor: "#287A65",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  doneText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  saveButton: {
    backgroundColor: "#287A65",
    padding: 17,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
});
