import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";

export default function LoginScreen() {
  const { profiles, switchProfile, isLoading } = useUserProfiles();

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSavedData() {
      try {
        const savedUser = await AsyncStorage.getItem("medimate_username");

        if (mounted && savedUser) {
          setUsername(savedUser);
        }
      } catch (error) {
        console.warn("Could not load saved username:", error);
      }
    }

    void loadSavedData();

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogin = async () => {
    const trimmed = username.trim();

    if (!trimmed) {
      setError("Please enter your account name.");
      return;
    }

    if (isLoading || submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const ownerProfile = profiles.find(
        (profile) =>
          profile.role === "self" &&
          profile.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );

      if (!ownerProfile) {
        setError(
          "No account was found with this name. Check your name or create a new account.",
        );
        return;
      }

      await switchProfile(ownerProfile.id);

      await AsyncStorage.setItem("medimate_username", ownerProfile.name);
      await AsyncStorage.setItem("medimate_is_logged_in", "true");

      router.replace("/(tabs)/home");
    } catch (error) {
      console.error("Login error:", error);
      setError(
        error instanceof Error ? error.message : "Could not log in. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        <View style={styles.background}>
          <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
              style={styles.flex}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.logoCircle}>
                  <Text style={styles.logo}>💊</Text>
                </View>

                <Text style={styles.brand}>MediMate</Text>

                <Text style={styles.tagline}>
                  Your health, organized. Your wellness, supported.
                </Text>

                <View style={styles.card}>
                  <Text style={styles.heading}>Welcome Back</Text>

                  <Text style={styles.description}>
                    Log in to continue managing your health and medication
                    schedule.
                  </Text>

                  <Text style={styles.label}>Your account name</Text>

                  <View style={styles.inputContainer}>
                    <Text style={styles.inputIcon}>👤</Text>

                    <TextInput
                      accessibilityLabel="Your account name"
                      value={username}
                      onChangeText={(value) => {
                        setUsername(value);
                        setError(null);
                      }}
                      placeholder="Enter your full name"
                      placeholderTextColor="#91A09B"
                      autoCapitalize="words"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() => void handleLogin()}
                      style={styles.input}
                    />
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <Pressable
                    accessibilityRole="button"
                    disabled={submitting || isLoading}
                    onPress={() => void handleLogin()}
                    style={[
                      styles.loginButton,
                      (submitting || isLoading) && styles.disabled,
                    ]}
                  >
                    {submitting || isLoading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.loginButtonText}>Log In</Text>
                    )}
                  </Pressable>

                  <View style={styles.separator}>
                    <View style={styles.line} />
                    <Text style={styles.orText}>OR</Text>
                    <View style={styles.line} />
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/(auth)/profile-setup")}
                    style={styles.getStartedButton}
                  >
                    <Text style={styles.getStartedText}>Create My Account</Text>
                  </Pressable>
                </View>

                <Text style={styles.footer}>
                  Your personal health information stays on this device.
                </Text>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    backgroundColor: "#102F2B",
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 30,
  },
  logoCircle: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 38,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  logo: {
    fontSize: 36,
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 14,
    textAlign: "center",
  },
  tagline: {
    color: "#C3DED5",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 28,
    marginTop: 7,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 23,
  },
  heading: {
    color: "#173D35",
    fontSize: 25,
    fontWeight: "800",
  },
  description: {
    color: "#71817C",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 22,
    marginTop: 7,
  },
  label: {
    color: "#344943",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  inputContainer: {
    alignItems: "center",
    backgroundColor: "#F6F9F7",
    borderColor: "#DDE7E2",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 53,
    paddingHorizontal: 14,
  },
  inputIcon: {
    fontSize: 17,
    marginRight: 10,
  },
  input: {
    color: "#243B35",
    flex: 1,
    fontSize: 15,
    minHeight: 50,
  },
  error: {
    color: "#C0392B",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  loginButton: {
    alignItems: "center",
    backgroundColor: "#287A65",
    borderRadius: 13,
    marginTop: 20,
    padding: 16,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.6,
  },
  separator: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginVertical: 20,
  },
  line: {
    backgroundColor: "#E3EBE6",
    flex: 1,
    height: 1,
  },
  orText: {
    color: "#87958F",
    fontSize: 12,
    fontWeight: "600",
  },
  getStartedButton: {
    alignItems: "center",
    backgroundColor: "#E8F5EE",
    borderColor: "#C8E5D6",
    borderRadius: 13,
    borderWidth: 1,
    padding: 15,
  },
  getStartedText: {
    color: "#287A65",
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    color: "#C3DED5",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 24,
    textAlign: "center",
  },
});
