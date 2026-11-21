import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";

export default function MediMateAIScreen() {
  const colors = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>MediMate AI</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Chat with AI for general questions, or review health records locally.
          Chat does not receive your MediMate medication or measurement data.
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/ai/chat")}
          style={[
            styles.card,
            { backgroundColor: colors.backgroundElement, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            ChatWithMe
          </Text>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Ask general questions and follow up naturally. Your chat text is sent
            to the configured AI service; health records are not attached.
          </Text>
          <Text style={[styles.cardAction, { color: colors.accent }]}>
            Open AI chat
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/ai/how-was-you")}
          style={[
            styles.card,
            { backgroundColor: colors.backgroundElement, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            HowWasYou
          </Text>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Review medication logging, scheduled tracking, and the measurements
            you recorded this week.
          </Text>
          <Text style={[styles.cardAction, { color: colors.accent }]}>
            View weekly review
          </Text>
        </Pressable>

        <View
          style={[
            styles.notice,
            { backgroundColor: colors.backgroundSelected, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.noticeTitle, { color: colors.text }]}>
            Privacy
          </Text>
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            Typed messages and recent chat text are sent to the configured AI
            provider. MediMate medication and measurement records stay on this
            device. Weekly reports and summary buttons use local records only.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 14, padding: 18 },
  cardTitle: { fontSize: 20, fontWeight: "700" },
  cardDescription: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  cardAction: { fontSize: 14, fontWeight: "700", marginTop: 16 },
  notice: { borderRadius: 14, borderWidth: 1, marginTop: 4, padding: 16 },
  noticeTitle: { fontSize: 15, fontWeight: "700" },
  noticeText: { fontSize: 13, lineHeight: 19, marginTop: 6 },
});
