import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppLock } from "@/context/AppLockContext";
import {
  hasAppLockPin,
  saveAppLockPin,
  verifyAppLockPin,
} from "@/services/appLockService";
import { useTheme } from "@/hooks/use-theme";

const TIMEOUT_OPTIONS = [
  { minutes: 0, label: "Immediately" },
  { minutes: 1, label: "1 min" },
  { minutes: 5, label: "5 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
];

export default function AppLockSettingsScreen() {
  const colors = useTheme();
  const { settings, updateSetting } = useAppLock();
  const [pinExists, setPinExists] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [changingPin, setChangingPin] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        hasAppLockPin(),
        LocalAuthentication.hasHardwareAsync().then(async (hardware) => {
          if (!hardware) return false;
          return LocalAuthentication.isEnrolledAsync();
        }),
      ])
        .then(([exists, biometrics]) => {
          if (!active) return;
          setPinExists(exists);
          setHasBiometrics(biometrics);
        })
        .catch((error: unknown) => {
          console.error("Could not load app lock capabilities:", error);
          if (active) {
            Alert.alert(
              "Security unavailable",
              "App lock settings could not be loaded. Please try again.",
            );
          }
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const handleEnable = async (enabled: boolean) => {
    if (busy) return;
    if (enabled && !pinExists) {
      setChangingPin(false);
      return;
    }
    setBusy(true);
    try {
      await updateSetting("enabled", enabled);
    } catch (error) {
      console.error("Could not update app lock status:", error);
      Alert.alert("Could not save setting", "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleSavePin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (pinExists && !(await verifyAppLockPin(pin))) {
        Alert.alert("Incorrect PIN", "Enter your current PIN to continue.");
        return;
      }
      if (!/^\d{4,8}$/.test(newPin)) {
        Alert.alert("Invalid PIN", "Choose a PIN with 4 to 8 digits.");
        return;
      }
      if (newPin !== confirmPin) {
        Alert.alert("PINs do not match", "Re-enter the new PIN.");
        return;
      }
      await saveAppLockPin(newPin);
      await updateSetting("enabled", true);
      setPinExists(true);
      setChangingPin(false);
      setPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (error) {
      console.error("Could not save app lock PIN:", error);
      Alert.alert("Could not save PIN", "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleBiometrics = async (enabled: boolean) => {
    if (!hasBiometrics) {
      Alert.alert(
        "Biometrics unavailable",
        "Set up fingerprint or face authentication on your device first.",
      );
      return;
    }
    try {
      await updateSetting("biometrics", enabled);
    } catch (error) {
      console.error("Could not update biometric setting:", error);
      Alert.alert("Could not save setting", "Please try again.");
    }
  };

  const handleTimeout = async (minutes: number) => {
    try {
      await updateSetting("timeoutMinutes", minutes);
    } catch (error) {
      console.error("Could not update app lock timeout:", error);
      Alert.alert("Could not save setting", "Please try again.");
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>App Lock</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Protect your health information with a PIN or biometrics.
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.optionText}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>
              Require PIN
            </Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Ask for your PIN when you return to MediMate.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Require PIN"
            disabled={busy || (!pinExists && !settings.enabled)}
            onValueChange={(value) => void handleEnable(value)}
            value={settings.enabled}
          />
        </View>

        {!pinExists || changingPin ? (
          <View style={styles.form}>
            {pinExists ? (
              <TextInput
                accessibilityLabel="Current PIN"
                keyboardType="number-pad"
                maxLength={8}
                onChangeText={setPin}
                placeholder="Current PIN"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                style={[
                  styles.input,
                  { borderColor: colors.border, color: colors.text },
                ]}
                value={pin}
              />
            ) : null}
            <TextInput
              accessibilityLabel="New PIN"
              keyboardType="number-pad"
              maxLength={8}
              onChangeText={(value) => setNewPin(value.replace(/\D/g, ""))}
              placeholder="New PIN (4–8 digits)"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text },
              ]}
              value={newPin}
            />
            <TextInput
              accessibilityLabel="Confirm new PIN"
              keyboardType="number-pad"
              maxLength={8}
              onChangeText={(value) => setConfirmPin(value.replace(/\D/g, ""))}
              placeholder="Confirm new PIN"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text },
              ]}
              value={confirmPin}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void handleSavePin()}
              style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? "Saving..." : pinExists ? "Change PIN" : "Set PIN"}
              </Text>
            </Pressable>
            {pinExists ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setChangingPin(false)}
                style={styles.cancelButton}
              >
                <Text style={[styles.link, { color: colors.accent }]}>
                  Cancel
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setChangingPin(true)}
            style={[
              styles.secondaryButton,
              { borderColor: colors.border, backgroundColor: colors.backgroundElement },
            ]}
          >
            <Text style={[styles.link, { color: colors.accent }]}>Change PIN</Text>
          </Pressable>
        )}

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.optionText}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>
              Biometric unlock
            </Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Use fingerprint or face authentication.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Biometric unlock"
            disabled={!settings.enabled || !hasBiometrics}
            onValueChange={(value) => void handleBiometrics(value)}
            value={settings.biometrics}
          />
        </View>
        {!hasBiometrics ? (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            No enrolled biometrics are available on this device.
          </Text>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Lock after inactivity
        </Text>
        <View style={styles.timeoutList}>
          {TIMEOUT_OPTIONS.map((option) => {
            const selected = settings.timeoutMinutes === option.minutes;
            return (
              <Pressable
                key={option.minutes}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => void handleTimeout(option.minutes)}
                style={[
                  styles.timeoutOption,
                  {
                    backgroundColor: selected
                      ? colors.backgroundSelected
                      : colors.backgroundElement,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.timeoutText,
                    { color: selected ? colors.accent : colors.text },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 18, marginTop: 6 },
  card: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 12,
    padding: 14,
  },
  optionText: { flex: 1, paddingRight: 8 },
  optionTitle: { fontSize: 15, fontWeight: "600" },
  description: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  form: { marginBottom: 14 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 10,
    padding: 13,
  },
  primaryButton: { alignItems: "center", borderRadius: 12, padding: 14 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  cancelButton: { alignItems: "center", padding: 12 },
  link: { fontSize: 14, fontWeight: "600" },
  note: { fontSize: 12, marginBottom: 16, marginTop: -4 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10, marginTop: 10 },
  timeoutList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeoutOption: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  timeoutText: { fontSize: 13, fontWeight: "600" },
});
