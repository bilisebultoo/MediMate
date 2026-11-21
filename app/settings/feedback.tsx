import { useState } from "react";
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";

export default function FeedbackScreen() {
  const colors = useTheme();
  const [message, setMessage] = useState("");

  const shareFeedback = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      Alert.alert("Add your feedback", "Write a suggestion or describe a problem.");
      return;
    }

    try {
      await Share.share(
        {
          title: "MediMate feedback",
          message: `MediMate feedback:\n\n${trimmedMessage}`,
        },
        { dialogTitle: "Share MediMate feedback" },
      );
    } catch (error) {
      console.error("Could not open the feedback share sheet:", error);
      Alert.alert("Could not share feedback", "Please try again.");
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          Feedback & support
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Share a suggestion or report a problem using an app on your device.
          MediMate does not send this message automatically.
        </Text>
        <TextInput
          accessibilityLabel="Feedback message"
          maxLength={2000}
          multiline
          onChangeText={setMessage}
          placeholder="Write your feedback"
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          textAlignVertical="top"
          value={message}
        />
        <Text style={[styles.privacyNote, { color: colors.textSecondary }]}>
          Avoid including passwords or sensitive medical information.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void shareFeedback()}
          style={[styles.button, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.buttonText}>Share feedback</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
    marginTop: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 180,
    padding: 14,
  },
  privacyNote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  button: {
    alignItems: "center",
    borderRadius: 12,
    marginTop: 20,
    padding: 15,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
