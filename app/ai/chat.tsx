import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
  getActiveProviderLabel,
  getAiConfig,
  isAiChatConfigured,
  requestAiChatReply,
  saveAiConfig,
  type AiChatMessage,
  type AiConfig,
  type AiProvider,
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
  const [review, setReview] = useState<WeeklyHealthReview | null>(null);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const reloadAiConfig = () => {
    void getAiConfig().then((cfg) => {
      setAiConfig(cfg);
    });
  };

  useEffect(() => {
    reloadAiConfig();
  }, []);

  const aiConfigured = isAiChatConfigured();
  const activeProviderName = getActiveProviderLabel(aiConfig || undefined);

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
          <View style={styles.headerTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to MediMate AI"
              onPress={() => router.back()}
            >
              <Text style={[styles.back, { color: colors.accent }]}>‹ MediMate AI</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open AI Settings"
              onPress={() => setIsSettingsOpen(true)}
              style={[
                styles.headerSettingButton,
                { backgroundColor: colors.backgroundElement, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.headerSettingText, { color: colors.accent }]}>
                ⚙️ AI Settings
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>ChatWithMe</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Typed messages go to {activeProviderName} · health records stay on this device
          </Text>
        </View>

        <ChatConversation
          key={activeProfile?.id ?? "no-profile"}
          aiConfigured={aiConfigured}
          colors={colors}
          onOpenSettings={() => setIsSettingsOpen(true)}
          review={visibleReview}
          summaryError={visibleSummaryError}
          summaryLoading={
            isProfileLoading ||
            Boolean(activeProfile && activeProfile.id !== loadedProfileId)
          }
        />

        {isSettingsOpen ? (
          <AiSettingsModal
            key={aiConfig ? JSON.stringify(aiConfig) : "default"}
            colors={colors}
            config={aiConfig}
            onClose={() => setIsSettingsOpen(false)}
            onSaved={() => {
              reloadAiConfig();
              setIsSettingsOpen(false);
            }}
            visible={isSettingsOpen}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatConversation({
  aiConfigured,
  colors,
  onOpenSettings,
  review,
  summaryError,
  summaryLoading,
}: {
  aiConfigured: boolean;
  colors: ThemeColors;
  onOpenSettings: () => void;
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
    if (!trimmed || sendingRef.current) return;

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

  const showConfigAction =
    Boolean(sendError) &&
    (sendError?.includes("limit") ||
      sendError?.includes("quota") ||
      sendError?.includes("key") ||
      sendError?.includes("configured") ||
      sendError?.includes("Settings"));

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
          <View
            style={[
              styles.configNotice,
              { backgroundColor: colors.backgroundElement, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.configNoticeText, { color: colors.textSecondary }]}>
              AI chat is ready to be configured. You can use Google Gemini (free API key) or OpenAI ChatGPT.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onOpenSettings}
              style={[styles.configureNowButton, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.configureNowText}>Configure AI (Google Gemini / ChatGPT)</Text>
            </Pressable>
          </View>
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
          <View style={styles.errorContainer}>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.error, { color: colors.danger }]}
            >
              {sendError}
            </Text>
            {showConfigAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={onOpenSettings}
                style={[
                  styles.errorActionChip,
                  { backgroundColor: colors.backgroundElement, borderColor: colors.accent },
                ]}
              >
                <Text style={[styles.errorActionText, { color: colors.accent }]}>
                  ⚙️ Switch to Free Google Gemini AI
                </Text>
              </Pressable>
            ) : null}
          </View>
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
            editable={!isSending}
            maxLength={2000}
            onChangeText={setQuestion}
            onSubmitEditing={() => void sendAiQuestion(question)}
            placeholder="Ask a general question"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="send"
            style={[styles.input, { color: colors.text }]}
            value={question}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message to AI"
            accessibilityState={{
              disabled: !question.trim() || isSending,
            }}
            disabled={!question.trim() || isSending}
            onPress={() => void sendAiQuestion(question)}
            style={[
              styles.sendButton,
              {
                backgroundColor: colors.accent,
                opacity: question.trim() && !isSending ? 1 : 0.5,
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

function AiSettingsModal({
  colors,
  config,
  onClose,
  onSaved,
  visible,
}: {
  colors: ThemeColors;
  config: AiConfig | null;
  onClose: () => void;
  onSaved: () => void;
  visible: boolean;
}) {
  const initialGeminiModel =
    config?.geminiModel &&
    config.geminiModel !== "gemini-1.5-flash" &&
    config.geminiModel !== "gemini-2.0-flash"
      ? config.geminiModel
      : "gemini-3.5-flash-lite";

  const [provider, setProvider] = useState<AiProvider>(
    config?.provider === "openai" ? "openai" : "gemini",
  );
  const [geminiKey, setGeminiKey] = useState(config?.geminiApiKey || "");
  const [geminiModel, setGeminiModel] = useState(initialGeminiModel);
  const [openAiKey, setOpenAiKey] = useState(config?.openAiApiKey || "");
  const [openAiModel, setOpenAiModel] = useState(
    config?.openAiModel || "gpt-4o-mini",
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveAiConfig({
        provider,
        geminiApiKey: geminiKey.trim(),
        geminiModel,
        openAiApiKey: openAiKey.trim(),
        openAiModel,
      });
      onSaved();
    } catch (e) {
      console.error("Could not save AI config:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const openGeminiKeyWebsite = () => {
    void Linking.openURL("https://aistudio.google.com/app/apikey");
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={modalStyles.overlay}>
        <View
          style={[
            modalStyles.card,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={modalStyles.headerRow}>
            <Text style={[modalStyles.title, { color: colors.text }]}>
              AI Provider Settings
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              onPress={onClose}
              style={modalStyles.closeButton}
            >
              <Text style={[modalStyles.closeText, { color: colors.textSecondary }]}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={modalStyles.body} keyboardShouldPersistTaps="handled">
            <Text style={[modalStyles.sectionLabel, { color: colors.textSecondary }]}>
              Select AI Provider
            </Text>
            <View style={modalStyles.tabRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setProvider("gemini")}
                style={[
                  modalStyles.tabButton,
                  {
                    backgroundColor:
                      provider === "gemini" ? colors.accent : colors.backgroundElement,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    modalStyles.tabText,
                    { color: provider === "gemini" ? "#FFFFFF" : colors.text },
                  ]}
                >
                  Google Gemini (Free)
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setProvider("openai")}
                style={[
                  modalStyles.tabButton,
                  {
                    backgroundColor:
                      provider === "openai" ? colors.accent : colors.backgroundElement,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    modalStyles.tabText,
                    { color: provider === "openai" ? "#FFFFFF" : colors.text },
                  ]}
                >
                  OpenAI ChatGPT
                </Text>
              </Pressable>
            </View>

            {provider === "gemini" ? (
              <View style={modalStyles.providerBlock}>
                <View
                  style={[
                    modalStyles.tipBox,
                    { backgroundColor: colors.backgroundSelected, borderColor: colors.border },
                  ]}
                >
                  <Text style={[modalStyles.tipTitle, { color: colors.text }]}>
                    ✨ 100% Free Google Gemini API
                  </Text>
                  <Text style={[modalStyles.tipText, { color: colors.textSecondary }]}>
                    Google Gemini provides a generous free tier (1,500 requests/day) with no credit card required.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={openGeminiKeyWebsite}
                    style={[modalStyles.linkButton, { borderColor: colors.accent }]}
                  >
                    <Text style={[modalStyles.linkButtonText, { color: colors.accent }]}>
                      Get Free Gemini Key (Google AI Studio) ↗
                    </Text>
                  </Pressable>
                </View>

                <Text style={[modalStyles.fieldLabel, { color: colors.text }]}>
                  Gemini API Key
                </Text>
                <TextInput
                  accessibilityLabel="Gemini API Key"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setGeminiKey}
                  placeholder="Paste AIzaSy... API key"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    modalStyles.input,
                    {
                      backgroundColor: colors.backgroundElement,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={geminiKey}
                />

                <Text style={[modalStyles.fieldLabel, { color: colors.text }]}>
                  Gemini Model
                </Text>
                <View style={modalStyles.modelSelectorRow}>
                  {["gemini-3.5-flash-lite"].map((m) => (
                    <Pressable
                      key={m}
                      accessibilityRole="button"
                      onPress={() => setGeminiModel(m)}
                      style={[
                        modalStyles.modelChip,
                        {
                          backgroundColor:
                            geminiModel === m ? colors.accent : colors.backgroundElement,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          modalStyles.modelChipText,
                          { color: geminiModel === m ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View style={modalStyles.providerBlock}>
                <View
                  style={[
                    modalStyles.tipBox,
                    { backgroundColor: colors.backgroundSelected, borderColor: colors.border },
                  ]}
                >
                  <Text style={[modalStyles.tipTitle, { color: colors.text }]}>
                    OpenAI API Key
                  </Text>
                  <Text style={[modalStyles.tipText, { color: colors.textSecondary }]}>
                    Requires active credit billing on your OpenAI account. If quota limit is reached, switch to Google Gemini above.
                  </Text>
                </View>

                <Text style={[modalStyles.fieldLabel, { color: colors.text }]}>
                  OpenAI API Key
                </Text>
                <TextInput
                  accessibilityLabel="OpenAI API Key"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setOpenAiKey}
                  placeholder="Paste sk-... API key"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    modalStyles.input,
                    {
                      backgroundColor: colors.backgroundElement,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={openAiKey}
                />

                <Text style={[modalStyles.fieldLabel, { color: colors.text }]}>
                  OpenAI Model
                </Text>
                <View style={modalStyles.modelSelectorRow}>
                  {["gpt-4o-mini"].map((m) => (
                    <Pressable
                      key={m}
                      accessibilityRole="button"
                      onPress={() => setOpenAiModel(m)}
                      style={[
                        modalStyles.modelChip,
                        {
                          backgroundColor:
                            openAiModel === m ? colors.accent : colors.backgroundElement,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          modalStyles.modelChipText,
                          { color: openAiModel === m ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={modalStyles.footerRow}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={[
                modalStyles.footerButton,
                { backgroundColor: colors.backgroundElement, borderColor: colors.border },
              ]}
            >
              <Text style={[modalStyles.footerButtonText, { color: colors.text }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={handleSave}
              style={[
                modalStyles.footerButton,
                modalStyles.saveButton,
                { backgroundColor: colors.accent },
              ]}
            >
              <Text style={modalStyles.saveButtonText}>
                {isSaving ? "Saving…" : "Save Settings"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  conversation: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  headerTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  back: { fontSize: 15, fontWeight: "600" },
  headerSettingButton: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerSettingText: { fontSize: 13, fontWeight: "600" },
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
  configNotice: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  configNoticeText: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  configureNowButton: {
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 8,
  },
  configureNowText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  inputRow: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", padding: 6 },
  input: { flex: 1, fontSize: 14, maxHeight: 96, minHeight: 42, paddingHorizontal: 10 },
  sendButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  thinking: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", marginBottom: 10, padding: 10 },
  thinkingText: { fontSize: 13, marginLeft: 8 },
  errorContainer: {
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  error: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  errorActionChip: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  errorActionText: { fontSize: 12, fontWeight: "600" },
});

const modalStyles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    maxHeight: "85%",
    padding: 20,
    width: "100%",
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "700" },
  closeButton: { padding: 4 },
  closeText: { fontSize: 18, fontWeight: "600" },
  body: { marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8, textTransform: "uppercase" },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tabButton: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabText: { fontSize: 13, fontWeight: "600" },
  providerBlock: { gap: 12 },
  tipBox: { borderRadius: 14, borderWidth: 1, padding: 12 },
  tipTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  tipText: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  linkButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  linkButtonText: { fontSize: 12, fontWeight: "600" },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modelSelectorRow: { flexDirection: "row", gap: 8 },
  modelChip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modelChipText: { fontSize: 12, fontWeight: "600" },
  footerRow: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  footerButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  footerButtonText: { fontSize: 14, fontWeight: "600" },
  saveButton: { borderWidth: 0 },
  saveButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
