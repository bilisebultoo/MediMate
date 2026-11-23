import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, {
    type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles, type ProfileInput } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";

const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Prefer not to say"];

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function calculateAge(date: Date): number {
  const today = new Date();

  let age = today.getFullYear() - date.getFullYear();

  const birthdayHasNotPassed =
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());

  if (birthdayHasNotPassed) {
    age--;
  }

  return age;
}

export default function ProfileSetupScreen() {
  const colors = useTheme();
  const { createSelfProfile } = useUserProfiles();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleDateChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type === "dismissed") {
      setShowDatePicker(false);
      return;
    }

    if (selectedDate) {
      setDateOfBirth(selectedDate);
    }

    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
    }
  };

  const handleSubmit = async () => {
    if (saving) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      Alert.alert("Full name required", "Please enter your full name.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    if (!gender) {
      Alert.alert("Gender required", "Please select your gender.");
      return;
    }

    if (!dateOfBirth) {
      Alert.alert("Birthday required", "Please select your date of birth.");
      return;
    }

    if (dateOfBirth.getTime() > Date.now()) {
      Alert.alert("Invalid birthday", "Date of birth cannot be in the future.");
      return;
    }

    const input: ProfileInput = {
      name: trimmedName,
      email: trimmedEmail,
      gender,
      dateOfBirth: formatDate(dateOfBirth),
    };

    setSaving(true);

    try {
      await createSelfProfile(input);

      await AsyncStorage.setItem("medimate_username", trimmedName);
      await AsyncStorage.setItem("medimate_is_logged_in", "true");

      router.replace("/(tabs)/home");
    } catch (error) {
      console.error("Profile setup error:", error);

      Alert.alert(
        "Could not create profile",
        error instanceof Error ? error.message : "Please try again.",
        [
          { text: "OK" },
          {
            text: "Go to Login",
            onPress: () => router.replace("/(auth)/login"),
          },
        ],
      );
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = dateOfBirth
    ? dateOfBirth.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Choose your birthday";

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>💊</Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Create Your Profile
          </Text>

          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Let's set up your personal MediMate health profile.
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>
            Full name *
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            maxLength={100}
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <Text style={[styles.label, { color: colors.text }]}>
            Email address *
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            maxLength={254}
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <Text style={[styles.label, { color: colors.text }]}>Gender *</Text>

          <View style={styles.genderContainer}>
            {GENDER_OPTIONS.map((option) => {
              const selected = gender === option;

              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setGender(option)}
                  style={[
                    styles.genderOption,
                    {
                      backgroundColor: selected
                        ? colors.accent
                        : colors.backgroundElement,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.genderText,
                      {
                        color: selected ? "#FFFFFF" : colors.text,
                      },
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>
            Date of birth *
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => setShowDatePicker(true)}
            style={[
              styles.dateButton,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.dateText, { color: colors.text }]}>
              📅 {dateLabel}
            </Text>
          </Pressable>

          {showDatePicker && (
            <View style={styles.pickerContainer}>
              <DateTimePicker
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={new Date()}
                value={dateOfBirth ?? new Date(2000, 0, 1)}
                onChange={handleDateChange}
              />

              {Platform.OS === "ios" && (
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Text style={[styles.doneText, { color: colors.accent }]}>
                    Done
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {dateOfBirth && (
            <View style={styles.ageCard}>
              <Text style={styles.ageLabel}>Your calculated age</Text>
              <Text style={styles.ageValue}>
                {calculateAge(dateOfBirth)} years old
              </Text>
              <Text style={styles.ageNote}>
                Automatically calculated from your birthday.
              </Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void handleSubmit()}
            style={[styles.submitButton, saving && styles.disabledButton]}
          >
            <Text style={styles.submitText}>
              {saving ? "Creating profile..." : "Create My Profile"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={[styles.backText, { color: colors.textSecondary }]}>
              Back to Login
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 22,
    paddingBottom: 40,
  },
  iconCircle: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#D9EEE5",
    borderRadius: 35,
    height: 70,
    justifyContent: "center",
    marginBottom: 18,
    width: 70,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 22,
    marginTop: 8,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 17,
  },
  input: {
    borderRadius: 13,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  genderContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  genderOption: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  genderText: {
    fontSize: 13,
    fontWeight: "600",
  },
  dateButton: {
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 15,
  },
  dateText: {
    fontSize: 15,
  },
  pickerContainer: {
    alignItems: "center",
    borderRadius: 12,
    marginTop: 10,
    padding: 10,
  },
  doneText: {
    fontWeight: "700",
    padding: 10,
  },
  ageCard: {
    backgroundColor: "#E8F5EE",
    borderRadius: 13,
    marginTop: 15,
    padding: 15,
  },
  ageLabel: {
    color: "#527568",
    fontSize: 13,
  },
  ageValue: {
    color: "#287A65",
    fontSize: 21,
    fontWeight: "800",
    marginTop: 4,
  },
  ageNote: {
    color: "#527568",
    fontSize: 12,
    marginTop: 4,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: "#287A65",
    borderRadius: 14,
    marginTop: 28,
    padding: 16,
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  backButton: {
    alignItems: "center",
    padding: 16,
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
