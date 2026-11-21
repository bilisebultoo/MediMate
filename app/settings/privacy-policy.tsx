import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";

const PRIVACY_SECTIONS = [
  {
    title: "Information stored on this device",
    text: "MediMate stores profile details, medicines, appointments, contacts, health records, reminders, and preferences in the app's local database on this device.",
  },
  {
    title: "No account or cloud sync",
    text: "This version of MediMate does not provide an account service or cloud synchronization. Information entered in one installation is not automatically shared with another device.",
  },
  {
    title: "Sharing and device security",
    text: "If you choose to export or share information, the destination app and its privacy practices apply. Protect your device with its screen lock and review its backup settings, since device backups may include app data.",
  },
  {
    title: "Your choices",
    text: "You can manage family profiles and their records separately in MediMate. Removing a dependent also removes their associated records from this device. You can also remove individual contacts or reminders from their screens.",
  },
  {
    title: "Health information",
    text: "Only enter information you are comfortable storing on this device. MediMate is an organizer and does not provide medical diagnosis or treatment.",
  },
];

export default function PrivacyPolicyScreen() {
  const colors = useTheme();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          Privacy & security
        </Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          How this version of MediMate handles information entered in the app.
        </Text>
        {PRIVACY_SECTIONS.map((section) => (
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
