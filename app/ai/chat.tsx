import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type ScrollViewInstance,
  View,
} from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";

import { useUserProfiles } from "@/context/UserContext";
import { useTheme } from "@/hooks/use-theme";
import {
  isAiChatConfigured,
  requestAiChatReply,
  type AiChatMessage,
} from "@/services/aiChat";
import {
  getWeeklyHealthReview,
  type WeeklyHealthReview,
} from "@/services/weeklyHealthReview";

type ChatMessage = {
  id: number;
  from: "user" | "assistant";
  localOnly?: boolean;
  text: string;
};

type ThemeColors = ReturnType<typeof useTheme>;

function answerFromWeeklyReview(
  question: string,
  review: WeeklyHealthReview,
): string {
  const normalized = question.toLocaleLowerCase();
  if (
    /\b(dose|doses|medicine|medication|missed|skipped|adherence)\b/.test(
      normalized,
    )
  ) {
    if (review.medication.scheduled === 0) {
      return "I found no scheduled doses due in this week's records. That does not confirm whether your medication plan is complete.";
    }
    return `This week, ${review.medication.taken} of ${review.medication.scheduled} scheduled doses were marked taken. ${review.medication.missed} were marked missed, ${review.medication.skipped} skipped, and ${review.medication.pending} have no recorded outcome. For advice about a missed dose, ask your pharmacist or prescriber; I can’t recommend changing or doubling a dose.`;
  }

  if (
    /\b(health|measurement|reading|blood pressure|pressure|sugar|glucose|heart rate|weight|temperature)\b/.test(
      normalized,
    )
  ) {
    if (review.health.measurements.length === 0) {
      return "I found no health measurements recorded this week. I can’t assess values that haven’t been logged.";
    }
    const summaries = review.health.measurements.map((measurement) => {
      const previous =
        measurement.count > 1
          ? ` Earlier entry: ${measurement.earliestValue} ${measurement.earliestUnit}.`
          : "";
      return `${measurement.name}: latest ${measurement.latestValue} ${measurement.unit} (${measurement.count} record(s)).${previous}`;
    });
    return `${summaries.join(" ")} These are summaries of entries only, not medical interpretations or diagnoses.`;
  }

  return "These quick summaries only cover this week's medication and measurement records.";
}

export default function ChatWithMeScreen() {
  const database = useSQLiteContext();
  const { activeProfile, isLoading: isProfileLoading } = useUserProfiles();
  const colors = useTheme();
  const aiConfigured = isAiChatConfigured();
  const [review, setReview] = useState<WeeklyHealthReview | null>(null);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isProfileLoading || !activeProfile) return;

    let isCurrent = true;
    const profileId = activeProfile.id;

    void getWeeklyHealthReview(database, profileId)
      .then((result) => {
        if (!isCurrent) return;
        setReview(result);
        setLoadedProfileId(profileId);
        setError(null);
      })
      .catch((cause: unknown) => {
        console.error("Could not load offline assistant data:", cause);
        if (!isCurrent) return;
        setLoadedProfileId(profileId);
        setError("Your local health summary could not be loaded.");
      });

    return () => {
      isCurrent = false;
    };
  }, [activeProfile, database, isProfileLoading]);

  const visibleReview =
    activeProfile?.id === loadedProfileId ? review : null;
  const visibleSummaryError =
    activeProfile?.id === loadedProfileId ? error : null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={[styles.back, { color: colors.accent }]}>‹ MediMate AI</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>ChatWithMe</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Typed messages go to OpenAI · health records stay on this device
          </Text>
        </View>
        <ChatConversation
          key={activeProfile?.id ?? "no-profile"}
          aiConfigured={aiConfigured}
          colors={colors}
          review={visibleReview}
          summaryError={visibleSummaryError}
          summaryLoading={
            isProfileLoading ||
            Boolean(activeProfile && activeProfile.id !== loadedProfileId)
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatConversation({
  aiConfigured,
  colors,
  review,
  summaryError,
  summaryLoading,
}: {
  aiConfigured: boolean;
  colors: ThemeColors;
  review: WeeklyHealthReview | null;
  summaryError: string | null;
  summaryLoading: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const nextMessageId = useRef(0);
  const sendingRef = useRef(false);
  const isMountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const scrollViewRef = useRef<ScrollViewInstance | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const sendLocalSummary = (text: string) => {
    if (!review || sendingRef.current) return;

    const userMessageId = nextMessageId.current++;
    const assistantMessageId = nextMessageId.current++;
    setMessages((current) => [
      ...current,
      { id: userMessageId, from: "user", localOnly: true, text },
      {
        id: assistantMessageId,
        from: "assistant",
        localOnly: true,
        text: answerFromWeeklyReview(text, review),
      },
    ]);
  };

  const sendAiQuestion = async (text: string) => {
    const trimmed = text.trim();
    if (!aiConfigured || !trimmed || sendingRef.current) return;

    sendingRef.current = true;
    const userMessageId = nextMessageId.current++;
    const userMessage: ChatMessage = {
      id: userMessageId,
      from: "user",
      text: trimmed,
    };
    const historyMessages: AiChatMessage[] = messages
      .filter((message) => !message.localOnly)
      .map((message): AiChatMessage => ({
        role: message.from,
        content: message.text,
      }));
    const history: AiChatMessage[] = historyMessages.slice(-11);
    history.push({ role: "user", content: trimmed });

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setSendError(null);
    setIsSending(true);

    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const reply = await requestAiChatReply(history, controller.signal);
      if (isMountedRef.current) {
        setMessages((current) => [
          ...current,
          {
            id: nextMessageId.current++,
            from: "assistant",
            text: reply,
          },
        ]);
      }
    } catch (cause) {
      if (!controller.signal.aborted && isMountedRef.current) {
        setSendError(
          cause instanceof Error
            ? cause.message
            : "The AI service could not answer. Please try again.",
        );
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      sendingRef.current = false;
      if (isMountedRef.current) setIsSending(false);
    }
  };

  const localSummaryStatus = summaryError
    ? summaryError
    : summaryLoading
      ? "Loading local summaries…"
      : review
        ? null
        : "Select a profile to use the local summaries.";

  return (
    <View style={styles.conversation}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        <View
          style={[
            styles.bubble,
            styles.assistantBubble,
            { backgroundColor: colors.backgroundElement, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.messageText, { color: colors.text }]}>
            Ask me general questions and follow up naturally. Your typed
            messages are sent to the configured AI service; this chat does not
            receive your MediMate health records. Use the local summary buttons
            below for recorded medication and measurement data. I can’t diagnose
            conditions or change your treatment plan.
          </Text>
        </View>
        {!aiConfigured ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.configurationStatus, { color: colors.textSecondary }]}
          >
            Supabase ChatWithMe isn’t configured yet. Add your project URL and
            publishable key, then deploy the Edge Function. Your local summary
            buttons remain available.
          </Text>
        ) : null}
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.bubble,
              message.from === "user"
                ? [styles.userBubble, { backgroundColor: colors.backgroundSelected }]
                : [
                    styles.assistantBubble,
                    { backgroundColor: colors.backgroundElement, borderColor: colors.border },
                  ],
            ]}
          >
            <Text style={[styles.messageText, { color: colors.text }]}>
              {message.text}
            </Text>
          </View>
        ))}
        {isSending ? (
          <View style={styles.thinking}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={[styles.thinkingText, { color: colors.textSecondary }]}>
              Thinking…
            </Text>
          </View>
        ) : null}
        {sendError ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.error, { color: colors.danger }]}
          >
            {sendError}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        <View style={styles.quickQuestions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !review || isSending }}
            disabled={!review || isSending}
            onPress={() => sendLocalSummary("How many doses were missed?")}
            style={[
              styles.quickQuestion,
              { borderColor: colors.border, opacity: review && !isSending ? 1 : 0.5 },
            ]}
          >
            <Text style={[styles.quickQuestionText, { color: colors.accent }]}>
              Medication summary
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !review || isSending }}
            disabled={!review || isSending}
            onPress={() => sendLocalSummary("What health readings did I log?")}
            style={[
              styles.quickQuestion,
              { borderColor: colors.border, opacity: review && !isSending ? 1 : 0.5 },
            ]}
          >
            <Text style={[styles.quickQuestionText, { color: colors.accent }]}>
              My measurements
            </Text>
          </Pressable>
        </View>
        {localSummaryStatus ? (
          <Text style={[styles.summaryStatus, { color: colors.textSecondary }]}>
            {localSummaryStatus}
          </Text>
        ) : null}
        <View
          style={[
            styles.inputRow,
            { backgroundColor: colors.backgroundElement, borderColor: colors.border },
          ]}
        >
          <TextInput
            accessibilityLabel="Ask the MediMate AI assistant"
            editable={aiConfigured && !isSending}
            maxLength={2000}
            onChangeText={setQuestion}
            onSubmitEditing={() => void sendAiQuestion(question)}
            placeholder={
              aiConfigured ? "Ask a general question" : "AI chat not configured"
            }
            placeholderTextColor={colors.textSecondary}
            returnKeyType="send"
            style={[styles.input, { color: colors.text }]}
            value={question}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message to AI"
            accessibilityState={{
              disabled: !aiConfigured || !question.trim() || isSending,
            }}
            disabled={!aiConfigured || !question.trim() || isSending}
            onPress={() => void sendAiQuestion(question)}
            style={[
              styles.sendButton,
              {
                backgroundColor: colors.accent,
                opacity: aiConfigured && question.trim() && !isSending ? 1 : 0.5,
              },
            ]}
          >
            <Text style={styles.sendText}>{isSending ? "Sending…" : "Send"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  conversation: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  back: { fontSize: 15, fontWeight: "600", marginBottom: 16 },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 5 },
  messages: { flexGrow: 1, padding: 16, paddingBottom: 8 },
  bubble: { borderRadius: 16, borderWidth: 1, marginBottom: 10, maxWidth: "90%", padding: 12 },
  assistantBubble: { alignSelf: "flex-start" },
  userBubble: { alignSelf: "flex-end", borderWidth: 0 },
  messageText: { fontSize: 14, lineHeight: 20 },
  composer: { padding: 12 },
  quickQuestions: { flexDirection: "row", marginBottom: 10 },
  quickQuestion: { borderRadius: 20, borderWidth: 1, marginRight: 8, paddingHorizontal: 12, paddingVertical: 8 },
  quickQuestionText: { fontSize: 12, fontWeight: "600" },
  summaryStatus: { fontSize: 12, marginBottom: 8, paddingHorizontal: 2 },
  configurationStatus: { fontSize: 13, lineHeight: 19, marginBottom: 10, paddingHorizontal: 10 },
  inputRow: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", padding: 6 },
  input: { flex: 1, fontSize: 14, maxHeight: 96, minHeight: 42, paddingHorizontal: 10 },
  sendButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  thinking: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", marginBottom: 10, padding: 10 },
  thinkingText: { fontSize: 13, marginLeft: 8 },
  error: { fontSize: 13, lineHeight: 19, marginBottom: 10, paddingHorizontal: 10 },
});
