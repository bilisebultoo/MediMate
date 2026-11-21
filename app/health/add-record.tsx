import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
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
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { HEALTH_METRICS, isHealthMetric } from "@/constants/health-metrics";
import { useUserProfiles } from "@/context/UserContext";
import {
  addHealthRecord,
  getHealthRecord,
  updateHealthRecord,
} from "@/services/healthService";
import type { HealthMetric } from "@/types/health";

type PickerMode = "date" | "time";

function isPositiveNumber(value: string): boolean {
  const parsed = Number(value);
  return value.trim().length > 0 && Number.isFinite(parsed) && parsed > 0;
}

export default function AddHealthRecordScreen() {
  const database = useSQLiteContext();
  const { activeProfile } = useUserProfiles();
  const { id: recordIdParam, metric: metricParam } = useLocalSearchParams<{
    id?: string;
    metric?: string;
  }>();
  const recordId =
    typeof recordIdParam === "string" && /^\d+$/.test(recordIdParam)
      ? Number(recordIdParam)
      : null;
  const isEditing = typeof recordIdParam === "string";
  const [metric, setMetric] = useState<HealthMetric>(
    typeof metricParam === "string" && isHealthMetric(metricParam)
      ? metricParam
      : "blood_pressure",
  );
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [value, setValue] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [recordedAt, setRecordedAt] = useState(new Date());
  const [activePicker, setActivePicker] = useState<PickerMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadedRecordId, setLoadedRecordId] = useState<number | null>(null);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [recordLoadError, setRecordLoadError] = useState<{
    recordId: number;
    profileId: string;
    message: string;
  } | null>(null);

  const selectedMetric = HEALTH_METRICS.find((item) => item.type === metric);
  const isCustom = metric === "custom";
  const isBloodPressure = metric === "blood_pressure";
  const loadingRecord =
    isEditing &&
    recordId !== null &&
    Number.isSafeInteger(recordId) &&
    (!activeProfile ||
      loadedRecordId !== recordId ||
      loadedProfileId !== activeProfile.id) &&
    (recordLoadError?.recordId !== recordId ||
      recordLoadError.profileId !== activeProfile?.id);
  const currentRecordLoadError = isEditing
    ? recordId === null || !Number.isSafeInteger(recordId)
      ? "This health record could not be opened."
      : recordLoadError?.recordId === recordId &&
          recordLoadError.profileId === activeProfile?.id
        ? recordLoadError.message
        : null
    : null;

  useEffect(() => {
    if (
      !isEditing ||
      recordId === null ||
      !Number.isSafeInteger(recordId) ||
      !activeProfile
    ) return;

    let isCurrent = true;
    const profileId = activeProfile.id;

    const loadRecord = async () => {
      try {
        const record = await getHealthRecord(database, recordId, profileId);
        if (!isCurrent) return;
        if (!record) {
          setRecordLoadError({
            recordId,
            profileId,
            message: "This health record was not found.",
          });
          return;
        }

        setMetric(record.metric);
        if (record.metric === "blood_pressure") {
          const [systolicValue = "", diastolicValue = ""] =
            record.value.split("/");
          setSystolic(systolicValue);
          setDiastolic(diastolicValue);
          setValue("");
        } else {
          setSystolic("");
          setDiastolic("");
          setValue(record.value);
        }
        setCustomName(record.metric === "custom" ? record.name : "");
        setCustomUnit(record.metric === "custom" ? record.unit : "");
        setNotes(record.notes ?? "");

        const date = new Date(record.recorded_at);
        if (!Number.isNaN(date.getTime())) setRecordedAt(date);
        setRecordLoadError(null);
        setLoadedRecordId(recordId);
        setLoadedProfileId(profileId);
      } catch (error) {
        console.error("Error loading health record for editing:", error);
        if (isCurrent) {
          setRecordLoadError({
            recordId,
            profileId,
            message: "This health record could not be loaded.",
          });
        }
      }
    };

    void loadRecord();
    return () => {
      isCurrent = false;
    };
  }, [activeProfile, database, isEditing, recordId]);

  const selectMetric = (nextMetric: HealthMetric) => {
    setMetric(nextMetric);
    setSystolic("");
    setDiastolic("");
    setValue("");
    setCustomName("");
    setCustomUnit("");
  };

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type === "dismissed") {
      setActivePicker(null);
      return;
    }

    if (selectedDate) setRecordedAt(selectedDate);
    if (Platform.OS !== "ios") setActivePicker(null);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!activeProfile) {
      Alert.alert("Profile unavailable", "Please select a profile and try again.");
      return;
    }
    if (
      loadingRecord ||
      currentRecordLoadError ||
      !activeProfile ||
      (isEditing && (recordId === null || loadedRecordId !== recordId))
    ) {
      return;
    }

    const recordName = selectedMetric?.name ?? customName.trim();
    let recordValue = value.trim();
    const unit = selectedMetric?.unit ?? customUnit.trim();

    if (isBloodPressure) {
      if (!/^\d+$/.test(systolic) || !isPositiveNumber(systolic)) {
        Alert.alert("Check systolic pressure", "Enter a valid systolic value.");
        return;
      }
      if (!/^\d+$/.test(diastolic) || !isPositiveNumber(diastolic)) {
        Alert.alert("Check diastolic pressure", "Enter a valid diastolic value.");
        return;
      }
      recordValue = `${systolic.trim()}/${diastolic.trim()}`;
    } else if (!isCustom && !isPositiveNumber(recordValue)) {
      Alert.alert("Check the reading", "Enter a value greater than zero.");
      return;
    }

    if (isCustom && !recordName) {
      Alert.alert("Name your reading", "Enter a name for this custom reading.");
      return;
    }
    if (!recordValue) {
      Alert.alert("Add a value", "Enter the health reading before saving.");
      return;
    }
    if (recordedAt.getTime() > Date.now()) {
      Alert.alert("Check the date", "A health reading cannot be in the future.");
      return;
    }

    setSaving(true);
    try {
      const record = {
        metric,
        name: recordName,
        value: recordValue,
        unit,
        recordedAt,
        notes: notes.trim() || null,
      };

      if (isEditing && recordId !== null) {
        const updated = await updateHealthRecord(
          database,
          recordId,
          activeProfile.id,
          record,
        );
        if (!updated) {
          Alert.alert(
            "Record no longer available",
            "This health record may have been deleted.",
          );
          return;
        }
      } else {
        await addHealthRecord(database, activeProfile.id, record);
      }
      router.back();
    } catch (error) {
      console.error("Error saving health record:", error);
      Alert.alert(
        "Could not save reading",
        "Please try again. Your health record was not saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = recordedAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = recordedAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          showsVerticalScrollIndicator={false}
        >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹  Health Tracker</Text>
        </Pressable>

        <Text style={styles.title}>
          {isEditing ? "Edit health reading" : "Add a health reading"}
        </Text>
        <Text style={styles.subtitle}>
          {isEditing
            ? "Update this measurement and its notes."
            : "Save a measurement with its date and any notes."}
        </Text>
        {loadingRecord ? (
          <Text style={styles.formMessage}>Loading health record...</Text>
        ) : currentRecordLoadError ? (
          <Text style={styles.formError}>{currentRecordLoadError}</Text>
        ) : null}

        <Text style={styles.label}>Reading type</Text>
        <View style={styles.metricOptions}>
          {HEALTH_METRICS.map((option) => (
            <MetricChoice
              key={option.type}
              title={option.name}
              selected={metric === option.type}
              onPress={() => selectMetric(option.type)}
            />
          ))}
          <MetricChoice
            title="Custom"
            selected={isCustom}
            onPress={() => selectMetric("custom")}
          />
        </View>

        {isCustom ? (
          <>
            <Text style={styles.label}>Reading name</Text>
            <TextInput
              value={customName}
              onChangeText={setCustomName}
              placeholder="For example, oxygen level"
              style={styles.input}
              maxLength={60}
              returnKeyType="next"
            />
            <Text style={styles.label}>Value and unit</Text>
            <View style={styles.valueRow}>
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder="Reading"
                style={[styles.input, styles.valueInput]}
                maxLength={40}
              />
              <TextInput
                value={customUnit}
                onChangeText={setCustomUnit}
                placeholder="Unit"
                style={[styles.input, styles.unitInput]}
                maxLength={16}
              />
            </View>
          </>
        ) : isBloodPressure ? (
          <>
            <Text style={styles.label}>Blood pressure (mmHg)</Text>
            <View style={styles.valueRow}>
              <View style={styles.fieldColumn}>
                <Text style={styles.fieldCaption}>Systolic</Text>
                <TextInput
                  value={systolic}
                  onChangeText={setSystolic}
                  placeholder="120"
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
              <Text style={styles.pressureSeparator}>/</Text>
              <View style={styles.fieldColumn}>
                <Text style={styles.fieldCaption}>Diastolic</Text>
                <TextInput
                  value={diastolic}
                  onChangeText={setDiastolic}
                  placeholder="80"
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>
              {selectedMetric?.name} ({selectedMetric?.unit})
            </Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder="Enter reading"
              style={styles.input}
              keyboardType="decimal-pad"
              maxLength={20}
            />
          </>
        )}

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

        {activePicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={recordedAt}
              mode={activePicker}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handlePickerChange}
              maximumDate={activePicker === "date" ? new Date() : undefined}
            />
            {Platform.OS === "ios" && (
              <Pressable
                onPress={() => setActivePicker(null)}
                style={styles.pickerDone}
              >
                <Text style={styles.pickerDoneText}>Done</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Add any details you want to remember"
          style={[styles.input, styles.notesInput]}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />

        <Pressable
          accessibilityRole="button"
          disabled={
            saving ||
            loadingRecord ||
            currentRecordLoadError !== null ||
            (isEditing && recordId === null)
          }
          onPress={handleSave}
          style={[
            styles.saveButton,
            (saving || loadingRecord || currentRecordLoadError !== null) &&
              styles.disabledButton,
          ]}
        >
          <Text style={styles.saveButtonText}>
            {saving
              ? "Saving..."
              : isEditing
                ? "Update reading"
                : "Save reading"}
          </Text>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MetricChoice({
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
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.metricChoice, selected && styles.selectedMetricChoice]}
    >
      <Text
        style={[
          styles.metricChoiceText,
          selected && styles.selectedMetricChoiceText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F5FAF8",
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
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
    fontSize: 27,
    fontWeight: "700",
  },
  subtitle: {
    color: "#72817C",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    marginBottom: 20,
  },
  formMessage: {
    color: "#72817C",
    fontSize: 14,
    marginBottom: 8,
  },
  formError: {
    color: "#B54848",
    fontSize: 14,
    marginBottom: 8,
  },
  label: {
    color: "#29483F",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 9,
    marginTop: 16,
  },
  metricOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricChoice: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE9E4",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  selectedMetricChoice: {
    backgroundColor: "#E4F2EC",
    borderColor: "#4F9B7E",
  },
  metricChoiceText: {
    color: "#687972",
    fontSize: 13,
    fontWeight: "600",
  },
  selectedMetricChoiceText: {
    color: "#236B55",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE9E4",
    borderWidth: 1,
    borderRadius: 13,
    color: "#263F37",
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  valueRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 10,
  },
  valueInput: {
    flex: 1,
  },
  unitInput: {
    width: 100,
  },
  fieldColumn: {
    flex: 1,
  },
  fieldCaption: {
    color: "#7A8883",
    fontSize: 12,
    marginBottom: 6,
  },
  pressureSeparator: {
    color: "#70817A",
    fontSize: 20,
    paddingBottom: 13,
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: 10,
  },
  dateTimeButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE9E4",
    borderWidth: 1,
    borderRadius: 13,
    flex: 1,
    padding: 13,
  },
  dateTimeCaption: {
    color: "#83918C",
    fontSize: 12,
  },
  dateTimeValue: {
    color: "#29483F",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 5,
  },
  pickerContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginTop: 10,
    overflow: "hidden",
  },
  pickerDone: {
    alignItems: "flex-end",
    padding: 12,
  },
  pickerDoneText: {
    color: "#2D8067",
    fontSize: 14,
    fontWeight: "700",
  },
  notesInput: {
    minHeight: 100,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#218164",
    borderRadius: 14,
    marginTop: 24,
    paddingVertical: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
