import { useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useUserProfiles,
  type ProfileInput,
} from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";
import type { User } from "@/types/user";

const GENDER_OPTIONS = [
  "Female",
  "Male",
  "Non-binary",
  "Prefer not to say",
] as const;

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function EditProfileScreen() {
  const colors = useTheme();
  const { id, role } = useLocalSearchParams<{ id?: string; role?: string }>();
  const { activeProfile, profiles, isLoading } = useUserProfiles();
  const isNewDependent = role === "dependent" && !id;
  const profile = id
    ? profiles.find((item) => item.id === id) ?? null
    : activeProfile;

  if (isLoading && !isNewDependent) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          Loading profile...
        </Text>
      </SafeAreaView>
    );
  }

  if (!isNewDependent && !profile) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          This profile could not be found.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <ProfileEditorForm
      key={profile?.id ?? "new-dependent"}
      isNewDependent={isNewDependent}
      profile={profile}
    />
  );
}

function ProfileEditorForm({
  isNewDependent,
  profile,
}: {
  isNewDependent: boolean;
  profile: User | null;
}) {
  const { addDependent, updateProfile } = useUserProfiles();
  const colors = useTheme();
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [gender, setGender] = useState<string | null>(
    profile?.gender ?? null,
  );
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(() =>
    parseDate(profile?.dateOfBirth ?? null),
  );
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleDateChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type === "dismissed") {
      setDatePickerVisible(false);
      return;
    }
    if (selectedDate) setDateOfBirth(selectedDate);
    if (Platform.OS !== "ios") setDatePickerVisible(false);
  };

  const handleSave = async () => {
    if (saving) return;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      Alert.alert("Add a name", "Enter a name for this profile.");
      return;
    }
    if (
      trimmedEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    ) {
      Alert.alert("Check the email", "Enter a valid email address.");
      return;
    }
    if (dateOfBirth && dateOfBirth.getTime() > Date.now()) {
      Alert.alert("Check the date", "Date of birth cannot be in the future.");
      return;
    }

    const input: ProfileInput = {
      name: trimmedName,
      email: trimmedEmail || null,
      gender,
      dateOfBirth: dateOfBirth ? formatDate(dateOfBirth) : null,
    };

    setSaving(true);
    try {
      if (isNewDependent) {
        await addDependent(input);
      } else if (profile) {
        await updateProfile(profile.id, input);
      } else {
        throw new Error("The profile could not be found.");
      }
      router.back();
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Could not save profile", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const title = isNewDependent
    ? "Add dependent"
    : profile?.role === "dependent"
      ? "Edit dependent"
      : "Edit profile";

  const dateLabel = dateOfBirth
    ? dateOfBirth.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Select date of birth";

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

          <Text style={[styles.label, { color: colors.text }]}>Name</Text>
          <TextInput
            accessibilityLabel="Profile name"
            autoCapitalize="words"
            maxLength={100}
            onChangeText={setName}
            placeholder="Full name"
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholderTextColor={colors.textSecondary}
            value={name}
          />

          <Text style={[styles.label, { color: colors.text }]}>Email</Text>
          <TextInput
            accessibilityLabel="Profile email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            maxLength={254}
            onChangeText={setEmail}
            placeholder="Email address (optional)"
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholderTextColor={colors.textSecondary}
            value={email}
          />

          <Text style={[styles.label, { color: colors.text }]}>Gender</Text>
          <View style={styles.options}>
            {GENDER_OPTIONS.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === option }}
                onPress={() => setGender(gender === option ? null : option)}
                style={[
                  styles.option,
                  {
                    backgroundColor:
                      gender === option
                        ? colors.accent
                        : colors.backgroundElement,
                    borderColor:
                      gender === option ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: colors.textSecondary },
                    gender === option && styles.selectedOptionText,
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>
            Date of birth
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setDatePickerVisible(true)}
            style={[
              styles.dateButton,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.dateText, { color: colors.text }]}>
              {dateLabel}
            </Text>
          </Pressable>
          {dateOfBirth ? (
            <Pressable onPress={() => setDateOfBirth(null)}>
              <Text style={[styles.clearDate, { color: colors.accent }]}>
                Clear date
              </Text>
            </Pressable>
          ) : null}
          {datePickerVisible ? (
            <View style={styles.pickerContainer}>
              <DateTimePicker
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={new Date()}
                mode="date"
                onChange={handleDateChange}
                value={dateOfBirth ?? new Date(2000, 0, 1)}
              />
              {Platform.OS === "ios" ? (
                <Pressable
                  onPress={() => setDatePickerVisible(false)}
                  style={styles.doneButton}
                >
                  <Text style={[styles.doneText, { color: colors.accent }]}>
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
            style={[styles.saveButton, saving && styles.disabledButton]}
          >
            <Text style={styles.saveText}>
              {saving ? "Saving..." : "Save profile"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => router.back()}
            style={styles.cancelButton}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F7FAF9",
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    color: "#173D35",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 12,
  },
  label: {
    color: "#344943",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 12,
    borderWidth: 1,
    color: "#243B35",
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  option: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  selectedOption: {
    backgroundColor: "#287A65",
    borderColor: "#287A65",
  },
  optionText: {
    color: "#64748B",
    fontSize: 13,
  },
  selectedOptionText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  dateButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE7E2",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 14,
  },
  dateText: {
    color: "#243B35",
    fontSize: 15,
  },
  clearDate: {
    color: "#287A65",
    fontSize: 13,
    marginTop: 8,
  },
  pickerContainer: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginTop: 10,
    padding: 10,
  },
  doneButton: {
    padding: 10,
  },
  doneText: {
    color: "#287A65",
    fontWeight: "700",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#287A65",
    borderRadius: 12,
    marginTop: 28,
    padding: 15,
  },
  saveText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelButton: {
    alignItems: "center",
    padding: 14,
  },
  cancelText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
  message: {
    color: "#71817C",
    fontSize: 15,
    padding: 24,
    textAlign: "center",
  },
});
