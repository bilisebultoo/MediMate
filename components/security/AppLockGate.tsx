import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppLock } from "@/context/AppLockContext";
import { useTheme } from "@/hooks/use-theme";

export function AppLockGate() {
  const {
    isReady,
    isLocked,
    loadError,
    settings,
    reload,
    unlockWithPin,
    unlockWithBiometrics,
  } = useAppLock();
  const colors = useTheme();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isReady && !isLocked && !loadError) return null;

  const handlePin = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const valid = await unlockWithPin(pin);
      if (valid) setPin("");
      else setError("That PIN is incorrect. Try again.");
    } catch (error) {
      console.error("Could not verify app lock PIN:", error);
      setError("PIN verification is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleBiometrics = async () => {
    setBusy(true);
    setError("");
    try {
      const success = await unlockWithBiometrics();
      if (!success) {
        setError("Biometric unlock was not completed. Use your PIN.");
      }
    } catch (error) {
      console.error("Biometric authentication failed:", error);
      setError("Biometric authentication is unavailable. Use your PIN.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>MediMate locked</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {loadError
            ? "Security settings could not be loaded."
            : "Enter your PIN to access your health information."}
        </Text>
        {loadError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void reload()}
            style={[styles.button, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        ) : !isReady ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <TextInput
              accessibilityLabel="App lock PIN"
              autoComplete="off"
              autoFocus
              keyboardType="number-pad"
              maxLength={8}
              onChangeText={(value) => {
                setPin(value.replace(/\D/g, ""));
                setError("");
              }}
              onSubmitEditing={() => void handlePin()}
              placeholder="Enter PIN"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={[
                styles.input,
                {
                  backgroundColor: colors.backgroundElement,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={pin}
            />
            {error ? (
              <Text style={[styles.error, { color: colors.danger }]}>
                {error}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy || pin.length < 4}
              onPress={() => void handlePin()}
              style={[
                styles.button,
                { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 },
              ]}
            >
              <Text style={styles.buttonText}>
                {busy ? "Verifying..." : "Unlock"}
              </Text>
            </Pressable>
            {settings.biometrics ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void handleBiometrics()}
                style={[
                  styles.biometricButton,
                  { borderColor: colors.border },
                ]}
              >
                <Text style={[styles.biometricText, { color: colors.accent }]}>
                  Unlock with biometrics
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  content: { padding: 24 },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 15, lineHeight: 22, marginVertical: 16, textAlign: "center" },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 18,
    marginVertical: 12,
    padding: 14,
    textAlign: "center",
  },
  error: { marginBottom: 8, textAlign: "center" },
  button: { alignItems: "center", borderRadius: 12, marginTop: 8, padding: 15 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  biometricButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  biometricText: { fontSize: 15, fontWeight: "600" },
});
