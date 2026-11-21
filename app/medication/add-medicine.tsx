import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ScrollViewInstance, TextInputInstance } from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUserProfiles } from "@/context/UserContext";
import { generateMedicationSchedules } from "@/services/medicationScheduleGenerator";
import {
  refreshMedicationDoseNotifications,
  requestMedicationDosePermissions,
} from "@/services/medicationDoseNotifications";
import {
  calculateMealReminderTime,
  DEFAULT_MEAL_TIMES,
  formatTime,
  MEAL_NAMES,
  type MealName,
  type MealTiming,
  type MealTimes,
} from "@/utils/mealTimes";

const medicineForms = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Liquid",
  "Injection",
  "Cream",
  "Drops",
  "Other",
];

const frequencies = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Custom",
];

const scheduleMethods = ["Meal-based", "Fixed times", "Interval-based"];

// Format date as YYYY-MM-DD
const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

// Convert YYYY-MM-DD into Date
const parseDate = (value: string) => {
  if (!value) return new Date();

  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
};

type MedicineRecord = {
  id: number;
  name: string;
  medicine_form: string;
  dose: string;
  frequency: string;
  schedule_method: string;
  meal: string | null;
  meal_timing: string | null;
  meal_offset_minutes: number | null;
  fixed_times: string | null;
  interval_value: string | number | null;
  start_time: string | null;
  start_date: string;
  end_date: string | null;
  instructions: string | null;
};

type MealSettingsRecord = {
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
};

export default function AddMedicineScreen() {
  const router = useRouter();
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();

  const { id } = useLocalSearchParams<{ id?: string }>();

  const isEditMode = Boolean(id);

  const [loadingMedicine, setLoadingMedicine] = useState(isEditMode);

  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const instructionsInputRef = useRef<TextInputInstance>(null);
  const instructionsFocused = useRef(false);

  const [name, setName] = useState("");
  const [medicineForm, setMedicineForm] = useState("Tablet");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("Once daily");

  const [scheduleMethod, setScheduleMethod] = useState("Fixed times");

  const [meal, setMeal] = useState<MealName>("Breakfast");
  const [mealTiming, setMealTiming] = useState<MealTiming>("Before");
  const [mealOffsetMinutes, setMealOffsetMinutes] = useState("30");
  const [mealTimes, setMealTimes] = useState<MealTimes>(DEFAULT_MEAL_TIMES);

  const [fixedTimes, setFixedTimes] = useState<string[]>(["08:00 AM"]);

  const [interval, setInterval] = useState("");
  const [startTime, setStartTime] = useState("08:00 AM");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [showFixedTimePicker, setShowFixedTimePicker] = useState(false);
  const [showIntervalTimePicker, setShowIntervalTimePicker] = useState(false);

  const [timePickerValue, setTimePickerValue] = useState(new Date());

  const [instructions, setInstructions] = useState("");

  const [showReview, setShowReview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const parsedMealOffset = /^\d+$/.test(mealOffsetMinutes)
    ? Number(mealOffsetMinutes)
    : -1;
  const mealReminderTime = calculateMealReminderTime(
    mealTimes[meal],
    mealTiming,
    parsedMealOffset,
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadMealTimes() {
        if (!activeProfile) return;
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
          console.error("Error loading meal times for medicine:", error);
          if (isActive) {
            Alert.alert(
              "Could not load meal times",
              "Default meal times will be used until your saved times are available.",
            );
          }
        }
      }

      loadMealTimes();
      return () => {
        isActive = false;
      };
    }, [activeProfile, database]),
  );

  // Load existing medicine information when editing.
  useEffect(() => {
    if (!id || !activeProfile) return;

    let isActive = true;
    const profileId = activeProfile.id;

    async function loadMedicine() {
      try {
        const medicine = await database.getFirstAsync<MedicineRecord>(
          "SELECT * FROM medicines WHERE id = ? AND user_id = ?",
          Number(id),
          profileId,
        );

        if (!isActive) return;

        if (!medicine) {
          Alert.alert("Not found", "This medicine could not be found.", [
            { text: "OK", onPress: () => router.back() },
          ]);
          return;
        }

        setName(medicine.name ?? "");
        setMedicineForm(medicine.medicine_form ?? "Tablet");
        setDose(medicine.dose ?? "");
        setFrequency(medicine.frequency ?? "Once daily");

        setScheduleMethod(medicine.schedule_method ?? "Fixed times");

        setMeal(
          MEAL_NAMES.find((item) => item === medicine.meal) ?? "Breakfast",
        );
        setMealTiming(
          medicine.meal_timing === "After" ? "After" : "Before",
        );
        setMealOffsetMinutes(
          String(medicine.meal_offset_minutes ?? 30),
        );

        setFixedTimes(
          medicine.fixed_times
            ? medicine.fixed_times
                .split(",")
                .map((time) => time.trim())
                .filter(Boolean)
            : ["08:00 AM"],
        );

        setInterval(medicine.interval_value?.toString() ?? "");
        setStartTime(medicine.start_time ?? "08:00 AM");

        setStartDate(medicine.start_date ?? "");
        setEndDate(medicine.end_date ?? "");

        setInstructions(medicine.instructions ?? "");
      } catch (error) {
        console.error("Error loading medicine for editing:", error);

        if (isActive) {
          Alert.alert(
            "Loading failed",
            "Could not load the medicine information.",
            [{ text: "OK", onPress: () => router.back() }],
          );
        }
      } finally {
        if (isActive) {
          setLoadingMedicine(false);
        }
      }
    }

    loadMedicine();

    return () => {
      isActive = false;
    };
  }, [activeProfile, id, database, router]);

  // Keep Additional Instructions visible when keyboard opens.
  useEffect(() => {
    const keyboardListener = Keyboard.addListener("keyboardDidShow", () => {
      const input = instructionsInputRef.current;
      if (instructionsFocused.current && input) {
        scrollViewRef.current?.scrollResponderScrollNativeHandleToKeyboard(
          input,
          12,
          true,
        );
      }
    });

    return () => keyboardListener.remove();
  }, []);

  const handleInstructionsFocus = () => {
    instructionsFocused.current = true;
  };

  const handleInstructionsBlur = () => {
    instructionsFocused.current = false;
  };

  // Start Date Picker
  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === "dismissed") {
      setShowStartPicker(false);
      return;
    }

    if (selectedDate) {
      const formattedDate = formatDate(selectedDate);

      setStartDate(formattedDate);

      if (endDate && endDate < formattedDate) {
        setEndDate("");
      }
    }

    if (Platform.OS !== "ios") {
      setShowStartPicker(false);
    }
  };

  // End Date Picker
  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === "dismissed") {
      setShowEndPicker(false);
      return;
    }

    if (selectedDate) {
      setEndDate(formatDate(selectedDate));
    }

    if (Platform.OS !== "ios") {
      setShowEndPicker(false);
    }
  };

  // Open clock for adding a fixed reminder time.
  const openFixedTimePicker = () => {
    Keyboard.dismiss();

    setTimePickerValue(new Date());
    setShowIntervalTimePicker(false);
    setShowFixedTimePicker(true);
  };

  // Open clock for interval starting time.
  const openIntervalTimePicker = () => {
    Keyboard.dismiss();

    setTimePickerValue(new Date());
    setShowFixedTimePicker(false);
    setShowIntervalTimePicker(true);
  };

  // Handle selected fixed reminder time.
  const handleFixedTimeChange = (event: any, selectedDate?: Date) => {
    if (event.type === "dismissed") {
      setShowFixedTimePicker(false);
      return;
    }

    if (selectedDate) {
      const selectedTime = formatTime(selectedDate);

      setFixedTimes((previousTimes) => {
        if (previousTimes.includes(selectedTime)) {
          return previousTimes;
        }

        return [...previousTimes, selectedTime];
      });
    }

    if (Platform.OS !== "ios") {
      setShowFixedTimePicker(false);
    }
  };

  // Handle selected interval starting time.
  const handleIntervalTimeChange = (event: any, selectedDate?: Date) => {
    if (event.type === "dismissed") {
      setShowIntervalTimePicker(false);
      return;
    }

    if (selectedDate) {
      setStartTime(formatTime(selectedDate));
    }

    if (Platform.OS !== "ios") {
      setShowIntervalTimePicker(false);
    }
  };

  // Remove a reminder time.
  const removeFixedTime = (time: string) => {
    setFixedTimes((previousTimes) =>
      previousTimes.filter((item) => item !== time),
    );
  };

  // Validate the form and open the review screen.
  const handleReview = () => {
    if (!name.trim()) {
      Alert.alert("Missing information", "Please enter the medicine name.");
      return;
    }

    if (!dose.trim()) {
      Alert.alert("Missing information", "Please enter the prescribed dose.");
      return;
    }

    if (!startDate.trim()) {
      Alert.alert("Missing information", "Please select the start date.");
      return;
    }

    if (endDate && endDate < startDate) {
      Alert.alert(
        "Invalid dates",
        "The end date cannot be earlier than the start date.",
      );
      return;
    }

    if (
      scheduleMethod === "Meal-based" &&
      (!Number.isInteger(parsedMealOffset) ||
        parsedMealOffset < 0 ||
        parsedMealOffset > 1440)
    ) {
      Alert.alert(
        "Invalid reminder offset",
        "Enter a whole number of minutes from 0 to 1440.",
      );
      return;
    }

    if (scheduleMethod === "Fixed times" && fixedTimes.length === 0) {
      Alert.alert(
        "Missing information",
        "Please add at least one reminder time.",
      );
      return;
    }

    if (
      scheduleMethod === "Interval-based" &&
      (!interval.trim() || !startTime.trim())
    ) {
      Alert.alert(
        "Missing information",
        "Please enter the interval and starting time.",
      );
      return;
    }

    Keyboard.dismiss();
    setShowReview(true);
  };

  // Save a new medicine or update an existing medicine.
  const handleSaveMedicine = async () => {
    if (isSaving) return;
    if (!activeProfile) {
      Alert.alert("Profile unavailable", "Please select a profile and try again.");
      return;
    }

    setIsSaving(true);
    const profileId = activeProfile.id;

    try {
      try {
        if (isEditMode) {
          await database.runAsync(
            `UPDATE medicines SET
              name = ?,
              medicine_form = ?,
              dose = ?,
              frequency = ?,
              schedule_method = ?,
              meal = ?,
              meal_timing = ?,
              meal_offset_minutes = ?,
              fixed_times = ?,
              interval_value = ?,
              start_time = ?,
              start_date = ?,
              end_date = ?,
              instructions = ?
            WHERE id = ? AND user_id = ?`,
            name.trim(),
            medicineForm,
            dose.trim(),
            frequency,
            scheduleMethod,
            scheduleMethod === "Meal-based" ? meal : null,
            scheduleMethod === "Meal-based" ? mealTiming : null,
            scheduleMethod === "Meal-based" ? parsedMealOffset : 30,
            scheduleMethod === "Fixed times" ? fixedTimes.join(", ") : null,
            scheduleMethod === "Interval-based" ? interval.trim() : null,
            scheduleMethod === "Interval-based" ? startTime.trim() : null,
            startDate.trim(),
            endDate.trim() || null,
            instructions.trim() || null,
            Number(id),
            profileId,
          );
        } else {
          await database.runAsync(
            `INSERT INTO medicines (
              user_id,
              name,
              medicine_form,
              dose,
              frequency,
              schedule_method,
              meal,
              meal_timing,
              meal_offset_minutes,
              fixed_times,
              interval_value,
              start_time,
              start_date,
              end_date,
              instructions,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            profileId,
            name.trim(),
            medicineForm,
            dose.trim(),
            frequency,
            scheduleMethod,
            scheduleMethod === "Meal-based" ? meal : null,
            scheduleMethod === "Meal-based" ? mealTiming : null,
            scheduleMethod === "Meal-based" ? parsedMealOffset : 30,
            scheduleMethod === "Fixed times" ? fixedTimes.join(", ") : null,
            scheduleMethod === "Interval-based" ? interval.trim() : null,
            scheduleMethod === "Interval-based" ? startTime.trim() : null,
            startDate.trim(),
            endDate.trim() || null,
            instructions.trim() || null,
            new Date().toISOString(),
          );
        }
      } catch (error) {
        console.error("Error saving medicine:", error);
        Alert.alert(
          "Saving failed",
          "We could not save this medicine. Please try again.",
        );
        return;
      }

      try {
        await generateMedicationSchedules(database);
      } catch (error) {
        console.error("Error generating medication schedule:", error);
        Alert.alert(
          "Medicine saved, schedule not generated",
          "The medicine was saved, but its upcoming doses could not be created. Please try again.",
        );
        return;
      }

      try {
        if (!(await requestMedicationDosePermissions())) {
          await refreshMedicationDoseNotifications(database);
          Alert.alert(
            "Medicine saved, notifications disabled",
            "Enable notifications for MediMate and, on Android, allow exact alarms to receive medicine reminders on time.",
            [{ text: "OK", onPress: () => router.back() }],
          );
          return;
        }

        await refreshMedicationDoseNotifications(database);

        Alert.alert(
          isEditMode ? "Medicine updated!" : "Medicine saved!",
          `${name} has been ${isEditMode ? "updated" : "saved"} successfully.`,
          [{ text: "OK", onPress: () => router.back() }],
        );
      } catch (error) {
        console.error("Error scheduling medication reminders:", error);
        Alert.alert(
          "Medicine saved, reminders not scheduled",
          "The medicine was saved, but its reminders could not be scheduled. Please try saving again.",
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Loading screen while existing medicine information is being retrieved.
  if (loadingMedicine) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#287A65" />
          <Text style={styles.loadingText}>
            Loading medicine information...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show the review screen before saving.
  if (showReview) {
    return (
      <ReviewMedicineScreen
        name={name}
        medicineForm={medicineForm}
        dose={dose}
        frequency={frequency}
        scheduleMethod={scheduleMethod}
        meal={meal}
        mealTiming={mealTiming}
        mealTime={mealTimes[meal]}
        mealOffsetMinutes={parsedMealOffset}
        reminderTime={mealReminderTime}
        fixedTimes={fixedTimes}
        interval={interval}
        startTime={startTime}
        startDate={startDate}
        endDate={endDate}
        instructions={instructions}
        isSaving={isSaving}
        isEditMode={isEditMode}
        onBack={() => setShowReview(false)}
        onSave={handleSaveMedicine}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.backButton}>‹ Back</Text>
            </Pressable>

            <Text style={styles.title}>
              {isEditMode ? "Edit Medicine" : "Add Medicine"}
            </Text>

            <Text style={styles.subtitle}>
              Enter the medicine information and prescribed schedule.
            </Text>
          </View>

          {/* Medicine Information */}
          <Text style={styles.sectionTitle}>Medicine Information</Text>

          <Text style={styles.label}>Medicine Name *</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter medicine name"
            value={name}
            onChangeText={setName}
            returnKeyType="next"
          />

          <Text style={styles.label}>Medicine Form</Text>

          <View style={styles.optionsContainer}>
            {medicineForms.map((item) => (
              <OptionButton
                key={item}
                title={item}
                selected={medicineForm === item}
                onPress={() => setMedicineForm(item)}
              />
            ))}
          </View>

          <Text style={styles.label}>Prescribed Dose *</Text>

          <TextInput
            style={styles.input}
            placeholder="Example: 1 tablet"
            value={dose}
            onChangeText={setDose}
            returnKeyType="next"
          />

          {/* Frequency */}
          <Text style={styles.sectionTitle}>Frequency</Text>

          <Text style={styles.label}>How often was it prescribed?</Text>

          <View style={styles.optionsContainer}>
            {frequencies.map((item) => (
              <OptionButton
                key={item}
                title={item}
                selected={frequency === item}
                onPress={() => setFrequency(item)}
              />
            ))}
          </View>

          {/* Scheduling Method */}
          <Text style={styles.sectionTitle}>Scheduling Method</Text>

          <Text style={styles.label}>How should reminders be scheduled?</Text>

          <View style={styles.methodContainer}>
            {scheduleMethods.map((item) => (
              <OptionButton
                key={item}
                title={item}
                selected={scheduleMethod === item}
                onPress={() => {
                  setShowFixedTimePicker(false);
                  setShowIntervalTimePicker(false);
                  setScheduleMethod(item);
                }}
              />
            ))}
          </View>

          {/* Meal-based Schedule */}
          {scheduleMethod === "Meal-based" && (
            <View style={styles.scheduleCard}>
              <Text style={styles.scheduleTitle}>Meal-based Schedule</Text>

              <Text style={styles.label}>Select a meal</Text>

              <View style={styles.optionsContainer}>
                {MEAL_NAMES.map((item) => (
                  <OptionButton
                    key={item}
                    title={item}
                    selected={meal === item}
                    onPress={() => setMeal(item)}
                  />
                ))}
              </View>

              <Text style={styles.label}>When should the reminder appear?</Text>

              <View style={styles.optionsContainer}>
                {(["Before", "After"] as const).map((item) => (
                  <OptionButton
                    key={item}
                    title={item}
                    selected={mealTiming === item}
                    onPress={() => setMealTiming(item)}
                  />
                ))}
              </View>

              <Text style={styles.label}>
                How many minutes {mealTiming.toLowerCase()} the meal?
              </Text>

              <TextInput
                style={styles.input}
                value={mealOffsetMinutes}
                onChangeText={setMealOffsetMinutes}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="30"
                placeholderTextColor="#94A3B8"
              />

              <View style={styles.mealPreview}>
                <Text style={styles.mealPreviewText}>
                  {meal} time: {mealTimes[meal]}
                </Text>
                <Text style={styles.mealPreviewText}>
                  {mealReminderTime
                    ? `Reminder time: ${mealReminderTime.time}${
                        mealReminderTime.dayOffset < 0
                          ? " (previous day)"
                          : mealReminderTime.dayOffset > 0
                            ? " (next day)"
                            : ""
                      }`
                    : "Enter a whole number from 0 to 1440 minutes."}
                </Text>
              </View>

              <Pressable
                style={styles.mealSettingsButton}
                onPress={() => router.push("/settings/meal-times")}
              >
                <Text style={styles.mealSettingsButtonText}>
                  Set breakfast, lunch, and dinner times
                </Text>
              </Pressable>

              <Text style={styles.helperText}>
                Reminder time is calculated from the selected meal time and
                offset.
              </Text>
            </View>
          )}

          {/* Fixed Time Schedule */}
          {scheduleMethod === "Fixed times" && (
            <View style={styles.scheduleCard}>
              <Text style={styles.scheduleTitle}>Fixed Reminder Times</Text>

              <Text style={styles.label}>Selected reminder times</Text>

              {fixedTimes.length > 0 ? (
                <View style={styles.selectedTimesContainer}>
                  {fixedTimes.map((time) => (
                    <View key={time} style={styles.timeChip}>
                      <Text style={styles.timeChipText}>{time}</Text>

                      <Pressable
                        onPress={() => removeFixedTime(time)}
                        hitSlop={8}
                      >
                        <Text style={styles.removeTime}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyTimes}>
                  No reminder times selected yet.
                </Text>
              )}

              <Pressable
                style={styles.addTimeButton}
                onPress={openFixedTimePicker}
              >
                <Text style={styles.addTimeButtonText}>
                  + Add Reminder Time
                </Text>
              </Pressable>

              {showFixedTimePicker && (
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>Select Reminder Time</Text>

                  <DateTimePicker
                    value={timePickerValue}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    is24Hour={false}
                    onChange={handleFixedTimeChange}
                  />

                  {Platform.OS === "ios" && (
                    <Pressable
                      style={styles.doneButton}
                      onPress={() => setShowFixedTimePicker(false)}
                    >
                      <Text style={styles.doneButtonText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <Text style={styles.helperText}>
                You can add multiple reminder times. Select the times according
                to the prescribed instructions.
              </Text>
            </View>
          )}

          {/* Interval Schedule */}
          {scheduleMethod === "Interval-based" && (
            <View style={styles.scheduleCard}>
              <Text style={styles.scheduleTitle}>Interval-based Schedule</Text>

              <Text style={styles.label}>Prescribed interval</Text>

              <TextInput
                style={styles.input}
                placeholder="Example: Every 6 hours"
                value={interval}
                onChangeText={setInterval}
              />

              <Text style={styles.label}>Starting time</Text>

              <Pressable
                style={styles.timeInput}
                onPress={openIntervalTimePicker}
              >
                <Text style={styles.timeInputText}>{startTime}</Text>
                <Text style={styles.clockIcon}>◷</Text>
              </Pressable>

              {showIntervalTimePicker && (
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>Select Starting Time</Text>

                  <DateTimePicker
                    value={timePickerValue}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    is24Hour={false}
                    onChange={handleIntervalTimeChange}
                  />

                  {Platform.OS === "ios" && (
                    <Pressable
                      style={styles.doneButton}
                      onPress={() => setShowIntervalTimePicker(false)}
                    >
                      <Text style={styles.doneButtonText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <Text style={styles.helperText}>
                Enter the interval according to the healthcare professional&apos;s
                instructions.
              </Text>
            </View>
          )}

          {/* Medicine Duration */}
          <Text style={styles.sectionTitle}>Medicine Duration</Text>

          <Text style={styles.label}>Start Date *</Text>

          <Pressable
            style={styles.dateInput}
            onPress={() => {
              setShowEndPicker(false);
              setShowStartPicker(true);
            }}
          >
            <Text
              style={[styles.dateText, !startDate && styles.placeholderText]}
            >
              {startDate || "Select start date"}
            </Text>

            <Text style={styles.calendarIcon}>▦</Text>
          </Pressable>

          {showStartPicker && (
            <View style={styles.pickerContainer}>
              <DateTimePicker
                value={parseDate(startDate)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleStartDateChange}
                maximumDate={new Date(2100, 11, 31)}
              />

              {Platform.OS === "ios" && (
                <Pressable
                  style={styles.doneButton}
                  onPress={() => setShowStartPicker(false)}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text style={styles.label}>End Date (Optional)</Text>

          <Pressable
            style={styles.dateInput}
            onPress={() => {
              setShowStartPicker(false);
              setShowEndPicker(true);
            }}
          >
            <Text style={[styles.dateText, !endDate && styles.placeholderText]}>
              {endDate || "Select end date (optional)"}
            </Text>

            <Text style={styles.calendarIcon}>▦</Text>
          </Pressable>

          {showEndPicker && (
            <View style={styles.pickerContainer}>
              <DateTimePicker
                value={parseDate(endDate || startDate)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleEndDateChange}
                minimumDate={startDate ? parseDate(startDate) : undefined}
                maximumDate={new Date(2100, 11, 31)}
              />

              {Platform.OS === "ios" && (
                <Pressable
                  style={styles.doneButton}
                  onPress={() => setShowEndPicker(false)}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              )}
            </View>
          )}

          {endDate !== "" && (
            <Pressable onPress={() => setEndDate("")}>
              <Text style={styles.clearDateText}>Remove end date</Text>
            </Pressable>
          )}

          {/* Additional Instructions */}
          <Text style={styles.sectionTitle}>Additional Instructions</Text>

          <Text style={styles.helperText}>
            Enter any additional instructions provided by your healthcare
            professional.
          </Text>

          <TextInput
            ref={instructionsInputRef}
            style={[styles.input, styles.textArea]}
            placeholder="Start typing your instructions here..."
            placeholderTextColor="#94A3B8"
            value={instructions}
            onChangeText={setInstructions}
            multiline
            textAlignVertical="top"
            scrollEnabled
            blurOnSubmit={false}
            onFocus={handleInstructionsFocus}
            onBlur={handleInstructionsBlur}
          />

          {/* Review Button */}
          <Pressable style={styles.saveButton} onPress={handleReview}>
            <Text style={styles.saveButtonText}>
              {isEditMode ? "Review Changes" : "Review Medicine"}
            </Text>
          </Pressable>

          <Text style={styles.footer}>
            Always follow the instructions provided by your healthcare
            professional.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Reusable option button
function OptionButton({
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
      onPress={onPress}
      style={[styles.optionButton, selected && styles.selectedOption]}
    >
      <Text style={[styles.optionText, selected && styles.selectedOptionText]}>
        {title}
      </Text>
    </Pressable>
  );
}

// Review screen props
type ReviewMedicineProps = {
  name: string;
  medicineForm: string;
  dose: string;
  frequency: string;
  scheduleMethod: string;
  meal: MealName;
  mealTiming: MealTiming;
  mealTime: string;
  mealOffsetMinutes: number;
  reminderTime: { time: string; dayOffset: number } | null;
  fixedTimes: string[];
  interval: string;
  startTime: string;
  startDate: string;
  endDate: string;
  instructions: string;
  isSaving: boolean;
  isEditMode: boolean;
  onBack: () => void;
  onSave: () => void;
};

// Review Medicine Screen
function ReviewMedicineScreen({
  name,
  medicineForm,
  dose,
  frequency,
  scheduleMethod,
  meal,
  mealTiming,
  mealTime,
  mealOffsetMinutes,
  reminderTime,
  fixedTimes,
  interval,
  startTime,
  startDate,
  endDate,
  instructions,
  isSaving,
  isEditMode,
  onBack,
  onSave,
}: ReviewMedicineProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.reviewContent}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} disabled={isSaving}>
          <Text style={styles.backButton}>‹ Edit Information</Text>
        </Pressable>

        <Text style={styles.title}>
          {isEditMode ? "Review Changes" : "Review Medicine"}
        </Text>

        <Text style={styles.subtitle}>
          Check the information below before saving your medicine.
        </Text>

        {/* Medicine information */}
        <View style={styles.reviewCard}>
          <View style={styles.reviewMedicineHeader}>
            <Text style={styles.reviewMedicineIcon}>💊</Text>

            <View style={{ flex: 1 }}>
              <Text style={styles.reviewMedicineName}>{name}</Text>

              <Text style={styles.reviewSubtitle}>
                {medicineForm} · {dose}
              </Text>
            </View>
          </View>

          <View style={styles.reviewDivider} />

          <Text style={styles.reviewSectionTitle}>Medicine Information</Text>

          <ReviewRow label="Medicine name" value={name} />
          <ReviewRow label="Medicine form" value={medicineForm} />
          <ReviewRow label="Prescribed dose" value={dose} />
          <ReviewRow label="Frequency" value={frequency} />
        </View>

        {/* Schedule information */}
        <View style={styles.reviewCard}>
          <Text style={styles.reviewSectionTitle}>Schedule Details</Text>

          <ReviewRow label="Scheduling method" value={scheduleMethod} />

          {scheduleMethod === "Meal-based" && (
            <>
              <ReviewRow label="Meal" value={meal} />
              <ReviewRow label="Meal time" value={mealTime} />
              <ReviewRow
                label="Reminder offset"
                value={`${mealOffsetMinutes} minutes ${mealTiming.toLowerCase()}`}
              />
              {reminderTime && (
                <ReviewRow
                  label="Reminder time"
                  value={`${reminderTime.time}${
                    reminderTime.dayOffset < 0
                      ? " (previous day)"
                      : reminderTime.dayOffset > 0
                        ? " (next day)"
                        : ""
                  }`}
                />
              )}
            </>
          )}

          {scheduleMethod === "Fixed times" && (
            <ReviewRow label="Reminder times" value={fixedTimes.join(", ")} />
          )}

          {scheduleMethod === "Interval-based" && (
            <>
              <ReviewRow label="Interval" value={interval} />
              <ReviewRow label="Starting time" value={startTime} />
            </>
          )}
        </View>

        {/* Duration */}
        <View style={styles.reviewCard}>
          <Text style={styles.reviewSectionTitle}>Medicine Duration</Text>

          <ReviewRow label="Start date" value={startDate} />

          <ReviewRow label="End date" value={endDate || "Not specified"} />
        </View>

        {/* Instructions */}
        <View style={styles.reviewCard}>
          <Text style={styles.reviewSectionTitle}>Additional Instructions</Text>

          <Text style={styles.reviewInstructions}>
            {instructions.trim() || "No additional instructions."}
          </Text>
        </View>

        {/* Confirm and save/update */}
        <Pressable
          style={[styles.saveButton, isSaving && styles.disabledSaveButton]}
          onPress={onSave}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>
            {isSaving
              ? "Saving..."
              : isEditMode
                ? "Confirm & Update Medicine"
                : "Confirm & Save Medicine"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.editButton}
          onPress={onBack}
          disabled={isSaving}
        >
          <Text style={styles.editButtonText}>Edit Information</Text>
        </Pressable>

        <Text style={styles.footer}>
          Always follow the instructions provided by your healthcare
          professional.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Reusable review row
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7FAF9",
  },

  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  loadingText: {
    fontSize: 14,
    color: "#82918D",
    marginTop: 12,
  },

  keyboardContainer: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  content: {
    padding: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },

  header: {
    marginTop: 10,
    marginBottom: 25,
  },

  backButton: {
    fontSize: 16,
    color: "#287A65",
    fontWeight: "600",
    marginBottom: 20,
  },

  title: {
    fontSize: 27,
    fontWeight: "bold",
    color: "#173D35",
  },

  subtitle: {
    fontSize: 14,
    color: "#82918D",
    marginTop: 7,
    lineHeight: 21,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#173D35",
    marginTop: 25,
    marginBottom: 15,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#344B43",
    marginBottom: 9,
    marginTop: 12,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EBE6",
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: "#173D35",
  },

  dateInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EBE6",
    borderRadius: 12,
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  dateText: {
    fontSize: 14,
    color: "#173D35",
  },

  placeholderText: {
    color: "#94A3B8",
  },

  calendarIcon: {
    fontSize: 20,
    color: "#287A65",
  },

  pickerContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginTop: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E3EBE6",
  },

  pickerTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#287A65",
    textAlign: "center",
    marginBottom: 8,
  },

  doneButton: {
    backgroundColor: "#287A65",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },

  doneButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },

  clearDateText: {
    color: "#C05A5A",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
  },

  optionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 8,
  },

  methodContainer: {
    gap: 10,
  },

  optionButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EBE6",
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 10,
  },

  selectedOption: {
    backgroundColor: "#E5F3EB",
    borderColor: "#287A65",
  },

  optionText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },

  selectedOptionText: {
    color: "#287A65",
    fontWeight: "bold",
  },

  scheduleCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#E3EBE6",
  },

  scheduleTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#287A65",
    marginBottom: 8,
  },

  mealPreview: {
    backgroundColor: "#F1F8F4",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },

  mealPreviewText: {
    color: "#344B43",
    fontSize: 13,
    lineHeight: 20,
  },

  mealSettingsButton: {
    alignSelf: "flex-start",
    paddingVertical: 10,
  },

  mealSettingsButtonText: {
    color: "#287A65",
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  selectedTimesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 5,
    marginBottom: 15,
  },

  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E5F3EB",
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 13,
    gap: 10,
  },

  timeChipText: {
    color: "#287A65",
    fontSize: 13,
    fontWeight: "bold",
  },

  removeTime: {
    color: "#C05A5A",
    fontSize: 20,
    fontWeight: "bold",
  },

  emptyTimes: {
    color: "#94A3B8",
    fontSize: 13,
    marginVertical: 10,
  },

  addTimeButton: {
    backgroundColor: "#287A65",
    padding: 14,
    borderRadius: 11,
    alignItems: "center",
    marginTop: 8,
  },

  addTimeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },

  timeInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EBE6",
    borderRadius: 12,
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  timeInputText: {
    color: "#173D35",
    fontSize: 15,
    fontWeight: "600",
  },

  clockIcon: {
    color: "#287A65",
    fontSize: 23,
  },

  helperText: {
    fontSize: 12,
    color: "#82918D",
    lineHeight: 19,
    marginTop: 10,
    marginBottom: 8,
  },

  textArea: {
    minHeight: 140,
    maxHeight: 180,
    paddingTop: 15,
    paddingBottom: 15,
  },

  saveButton: {
    backgroundColor: "#287A65",
    padding: 17,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 30,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },

  footer: {
    fontSize: 12,
    color: "#82918D",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 18,
  },

  // Review screen styles
  reviewContent: {
    padding: 20,
    paddingBottom: 50,
  },

  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: 17,
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#E3EBE6",
  },

  reviewMedicineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },

  reviewMedicineIcon: {
    fontSize: 35,
  },

  reviewMedicineName: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#173D35",
  },

  reviewSubtitle: {
    fontSize: 13,
    color: "#82918D",
    marginTop: 5,
  },

  reviewDivider: {
    height: 1,
    backgroundColor: "#E3EBE6",
    marginVertical: 17,
  },

  reviewSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#287A65",
    marginBottom: 13,
  },

  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F3F1",
  },

  reviewLabel: {
    flex: 1,
    fontSize: 13,
    color: "#82918D",
  },

  reviewValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#173D35",
    textAlign: "right",
  },

  reviewInstructions: {
    fontSize: 14,
    lineHeight: 22,
    color: "#344B43",
  },

  editButton: {
    padding: 15,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#287A65",
  },

  editButtonText: {
    color: "#287A65",
    fontSize: 14,
    fontWeight: "bold",
  },

  disabledSaveButton: {
    opacity: 0.6,
  },
});
