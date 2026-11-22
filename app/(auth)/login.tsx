import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
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
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useUserProfiles } from "@/context/UserContext";

const LOGIN_BACKGROUND_IMAGE = require("@/assets/images/login-background.jpg");

export default function LoginScreen() {
  const database = useSQLiteContext();
  const { profiles, activeProfile, refreshProfiles } = useUserProfiles();

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadSavedData() {
      try {
        const [savedUser, loggedInFlag] = await Promise.all([
          AsyncStorage.getItem("medimate_username"),
          AsyncStorage.getItem("medimate_is_logged_in"),
        ]);
        if (!isMounted) return;
        if (savedUser) {
          setUsername(savedUser);
        } else if (activeProfile?.name && activeProfile.name !== "My Profile") {
          setUsername(activeProfile.name);
        }
        if (loggedInFlag === "true") {
          setAlreadyLoggedIn(true);
        }
      } catch (err) {
        console.warn("Could not check saved login data:", err);
      }
    }
    void loadSavedData();
    return () => {
      isMounted = false;
    };
  }, [activeProfile]);

  const handleLogin = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Please enter your username to continue.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const existingProfile = profiles.find(
        (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );

      let targetProfileId: string;
      if (existingProfile) {
        targetProfileId = existingProfile.id;
      } else {
        const selfProfile =
          profiles.find((p) => p.role === "self") ?? activeProfile ?? profiles[0];

        if (selfProfile) {
          targetProfileId = selfProfile.id;
          await database.runAsync(
            "UPDATE profiles SET name = ? WHERE id = ?",
            trimmed,
            selfProfile.id,
          );
        } else {
          targetProfileId = "default";
          await database.runAsync(
            `INSERT OR REPLACE INTO profiles (id, name, role, created_at)
             VALUES (?, ?, 'self', ?)`,
            targetProfileId,
            trimmed,
            new Date().toISOString(),
          );
        }
      }

      await database.runAsync(
        `INSERT INTO active_profile (singleton_id, profile_id)
         VALUES (1, ?)
         ON CONFLICT(singleton_id) DO UPDATE SET profile_id = excluded.profile_id`,
        targetProfileId,
      );

      await refreshProfiles();
      await AsyncStorage.setItem("medimate_is_logged_in", "true");
      await AsyncStorage.setItem("medimate_username", trimmed);

      router.replace("/(tabs)/home");
    } catch (err) {
      console.error("Login failed:", err);
      setError("Could not complete login. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const firstName = username.trim().split(/\s+/)[0];

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        <ImageBackground
          source={LOGIN_BACKGROUND_IMAGE}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          {/* Subtle gradient overlay to ensure high contrast and readability */}
          <View style={styles.overlay} />

          <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.keyboardView}
            >
              <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Brand Pill */}
                <View style={styles.brandBadge}>
                  <Text style={styles.brandBadgeIcon}>💊</Text>
                  <Text style={styles.brandBadgeText}>MediMate Health</Text>
                </View>

                {/* Hero / Welcome Statements */}
                <View style={styles.welcomeSection}>
                  <Text style={styles.title}>Welcome to MediMate</Text>
                  <Text style={styles.statement}>
                    This is where you will be confident in managing your health.
                  </Text>
                </View>

                {/* Login Glass Card */}
                <View style={styles.glassCard}>
                  <Text style={styles.cardHeader}>Sign In</Text>
                  <Text style={styles.cardSubtitle}>
                    Enter your username to access your health and medication dashboard.
                  </Text>

                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Username</Text>
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputIcon}>👤</Text>
                      <TextInput
                        accessibilityLabel="Username input"
                        autoCapitalize="words"
                        autoCorrect={false}
                        onChangeText={(text) => {
                          setUsername(text);
                          if (error) setError(null);
                        }}
                        placeholder="e.g. Sana or John Doe"
                        placeholderTextColor="#7D93B2"
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                        style={styles.textInput}
                        value={username}
                      />
                      {username.length > 0 ? (
                        <Pressable
                          accessibilityLabel="Clear username"
                          accessibilityRole="button"
                          hitSlop={8}
                          onPress={() => setUsername("")}
                          style={styles.clearButton}
                        >
                          <Text style={styles.clearButtonText}>✕</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  {error ? (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>⚠️ {error}</Text>
                    </View>
                  ) : null}

                  {/* Primary Login Button */}
                  <Pressable
                    accessibilityLabel="Log in to MediMate"
                    accessibilityRole="button"
                    disabled={isSubmitting}
                    onPress={handleLogin}
                    style={({ pressed }) => [
                      styles.loginButton,
                      pressed && styles.loginButtonPressed,
                      isSubmitting && styles.loginButtonDisabled,
                    ]}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.loginButtonText}>
                        {alreadyLoggedIn && firstName
                          ? `Continue as ${firstName}`
                          : "Log In to MediMate"}
                      </Text>
                    )}
                  </Pressable>

                  {alreadyLoggedIn ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.replace("/(tabs)/home")}
                      style={styles.directHomeLink}
                    >
                      <Text style={styles.directHomeText}>
                        Go directly to Home Screen →
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* Footer Assurance */}
                <View style={styles.footerNote}>
                  <Text style={styles.footerText}>
                    🔒 Your health records and medication schedules stay private and secure on this device.
                  </Text>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </ImageBackground>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    height: "100%",
    width: "100%",
  },
  overlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "rgba(6, 18, 38, 0.72)",
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  brandBadge: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  brandBadgeIcon: {
    fontSize: 16,
  },
  brandBadgeText: {
    color: "#E2EEFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  welcomeSection: {
    alignItems: "center",
    marginBottom: 26,
    paddingHorizontal: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 10,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statement: {
    color: "#BBD5F3",
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24,
    textAlign: "center",
  },
  glassCard: {
    backgroundColor: "rgba(16, 32, 58, 0.82)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  cardHeader: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardSubtitle: {
    color: "#8FA8C8",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    color: "#D4E3F7",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  inputContainer: {
    alignItems: "center",
    backgroundColor: "rgba(6, 17, 34, 0.75)",
    borderColor: "rgba(100, 150, 220, 0.3)",
    borderRadius: 14,
    borderWidth: 1.2,
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 6,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  textInput: {
    color: "#FFFFFF",
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    minHeight: 38,
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 12,
    height: 22,
    justifyContent: "center",
    marginLeft: 8,
    width: 22,
  },
  clearButtonText: {
    color: "#C5D8F0",
    fontSize: 12,
    fontWeight: "700",
  },
  errorContainer: {
    backgroundColor: "rgba(235, 87, 87, 0.15)",
    borderColor: "rgba(235, 87, 87, 0.4)",
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {
    color: "#FF8E8E",
    fontSize: 13,
    fontWeight: "500",
  },
  loginButton: {
    alignItems: "center",
    backgroundColor: "#208AEF",
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 4,
    paddingVertical: 15,
    shadowColor: "#208AEF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonPressed: {
    backgroundColor: "#1872C7",
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  loginButtonDisabled: {
    opacity: 0.65,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  directHomeLink: {
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 6,
  },
  directHomeText: {
    color: "#9FC4EE",
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  footerNote: {
    marginTop: 24,
    paddingHorizontal: 12,
  },
  footerText: {
    color: "rgba(187, 213, 243, 0.7)",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
