import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";

const DISCLAIMER_SECTIONS = [
  {
    title: "Not medical advice",
    text: "MediMate is intended to help organize information and reminders. It does not provide medical advice, diagnosis, or treatment.",
  },
  {
    title: "Talk to a healthcare professional",
    text: "Always consult a qualified doctor, pharmacist, or other healthcare professional about medical questions and before changing, starting, or stopping a medicine or treatment.",
  },
  {
    title: "Do not rely on reminders alone",
    text: "Notifications can be delayed, silenced, or unavailable because of device settings, connectivity, battery restrictions, or other technical issues. Keep following the instructions from your healthcare professional and medicine packaging.",
  },
  {
    title: "Emergencies",
    text: "MediMate is not an emergency service and is not monitored. If you may be experiencing a medical emergency, contact your local emergency service immediately.",
  },
  {
    title: "Accuracy",
    text: "You are responsible for checking information entered into the app. MediMate does not verify medicine instructions, measurements, contacts, or appointment details.",
  },
];

export default function MedicalDisclaimerScreen() {
  const colors = useTheme();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          Medical disclaimer
        </Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Please read these important limitations before relying on MediMate.
        </Text>
        {DISCLAIMER_SECTIONS.map((section) => (
          <Text
            key={section.title}
            style={[
              styles.section,
              {
                color: colors.text,
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={styles.sectionTitle}>{section.title}{"\n"}</Text>
            {section.text}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    marginTop: 6,
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
    padding: 16,
  },
  sectionTitle: {
    fontWeight: "700",
  },
});
