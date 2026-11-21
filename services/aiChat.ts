import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getSupabaseChatSession,
  isSupabaseConfigured,
} from "@/services/supabaseClient";

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiProvider = "auto" | "gemini" | "openai" | "supabase";

export type AiConfig = {
  provider: AiProvider;
  geminiApiKey: string;
  geminiModel: string;
  openAiApiKey: string;
  openAiModel: string;
};

type AiChatResponse = {
  error?: unknown;
  reply?: unknown;
};

function isAiChatResponse(value: unknown): value is AiChatResponse {
  return typeof value === "object" && value !== null;
}

export const MEDIMATE_AI_SYSTEM_PROMPT =
  "You are MediMate, a helpful general-purpose conversational assistant. " +
  "Answer questions about education, technology, science, everyday life, and general health in a clear, natural, understandable way. " +
  "Give enough detail to explain the answer, use examples or steps when useful, and preserve context from earlier messages in this conversation. " +
  "You cannot access MediMate records; if asked about them, say so and direct the user to the local summary buttons. " +
  "For health and medication questions, provide general educational information only: do not diagnose, prescribe, or recommend changing a person's treatment plan or medication dose. " +
  "For missed-dose questions, direct the user to the medicine's official instructions or a pharmacist/prescriber. " +
  "For potentially urgent symptoms, advise contacting local emergency services or urgent medical care. " +
  "Be transparent about uncertainty and do not invent facts.";

const STORAGE_KEY_PROVIDER = "medimate_ai_provider";
const STORAGE_KEY_GEMINI_KEY = "medimate_gemini_api_key";
const STORAGE_KEY_GEMINI_MODEL = "medimate_gemini_model";
const STORAGE_KEY_OPENAI_KEY = "medimate_openai_api_key";
const STORAGE_KEY_OPENAI_MODEL = "medimate_openai_model";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

function resolveGeminiModel(storedModel?: string | null): string {
  const trimmed = storedModel?.trim();
  if (!trimmed || trimmed === "gemini-1.5-flash" || trimmed === "gemini-2.0-flash") {
    return process.env.EXPO_PUBLIC_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  }
  return trimmed;
}

let cachedConfig: AiConfig = {
  provider:
    (process.env.EXPO_PUBLIC_AI_PROVIDER?.trim().toLowerCase() as AiProvider) ||
    "auto",
  geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() || "",
  geminiModel: resolveGeminiModel(process.env.EXPO_PUBLIC_GEMINI_MODEL),
  openAiApiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() || "",
  openAiModel: process.env.EXPO_PUBLIC_OPENAI_MODEL?.trim() || "gpt-4o-mini",
};

// Asynchronously hydrate cachedConfig from local storage on load
void AsyncStorage.multiGet([
  STORAGE_KEY_PROVIDER,
  STORAGE_KEY_GEMINI_KEY,
  STORAGE_KEY_GEMINI_MODEL,
  STORAGE_KEY_OPENAI_KEY,
  STORAGE_KEY_OPENAI_MODEL,
])
  .then((pairs) => {
    const map = new Map(pairs);
    const p = map.get(STORAGE_KEY_PROVIDER);
    const gk = map.get(STORAGE_KEY_GEMINI_KEY);
    const gm = map.get(STORAGE_KEY_GEMINI_MODEL);
    const ok = map.get(STORAGE_KEY_OPENAI_KEY);
    const om = map.get(STORAGE_KEY_OPENAI_MODEL);

    cachedConfig = {
      provider:
        (p as AiProvider) ||
        (process.env.EXPO_PUBLIC_AI_PROVIDER?.trim().toLowerCase() as AiProvider) ||
        "auto",
      geminiApiKey:
        gk?.trim() || process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() || "",
      geminiModel: resolveGeminiModel(gm),
      openAiApiKey:
        ok?.trim() || process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() || "",
      openAiModel:
        om?.trim() ||
        process.env.EXPO_PUBLIC_OPENAI_MODEL?.trim() ||
        "gpt-4o-mini",
    };
  })
  .catch(() => {
    // Defaults preserved
  });

export async function getAiConfig(): Promise<AiConfig> {
  try {
    const pairs = await AsyncStorage.multiGet([
      STORAGE_KEY_PROVIDER,
      STORAGE_KEY_GEMINI_KEY,
      STORAGE_KEY_GEMINI_MODEL,
      STORAGE_KEY_OPENAI_KEY,
      STORAGE_KEY_OPENAI_MODEL,
    ]);
    const map = new Map(pairs);
    const p = map.get(STORAGE_KEY_PROVIDER);
    const gk = map.get(STORAGE_KEY_GEMINI_KEY);
    const gm = map.get(STORAGE_KEY_GEMINI_MODEL);
    const ok = map.get(STORAGE_KEY_OPENAI_KEY);
    const om = map.get(STORAGE_KEY_OPENAI_MODEL);

    cachedConfig = {
      provider:
        (p as AiProvider) ||
        (process.env.EXPO_PUBLIC_AI_PROVIDER?.trim().toLowerCase() as AiProvider) ||
        "auto",
      geminiApiKey:
        gk?.trim() || process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() || "",
      geminiModel: resolveGeminiModel(gm),
      openAiApiKey:
        ok?.trim() || process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() || "",
      openAiModel:
        om?.trim() ||
        process.env.EXPO_PUBLIC_OPENAI_MODEL?.trim() ||
        "gpt-4o-mini",
    };
  } catch {
    // Keep cached
  }
  return cachedConfig;
}

export async function saveAiConfig(newConfig: Partial<AiConfig>): Promise<void> {
  const current = await getAiConfig();
  const updated: AiConfig = {
    ...current,
    ...newConfig,
  };

  const ops: [string, string][] = [
    [STORAGE_KEY_PROVIDER, updated.provider],
    [STORAGE_KEY_GEMINI_KEY, updated.geminiApiKey || ""],
    [STORAGE_KEY_GEMINI_MODEL, updated.geminiModel || DEFAULT_GEMINI_MODEL],
    [STORAGE_KEY_OPENAI_KEY, updated.openAiApiKey || ""],
    [STORAGE_KEY_OPENAI_MODEL, updated.openAiModel || "gpt-4o-mini"],
  ];

  await AsyncStorage.multiSet(ops);
  cachedConfig = updated;
}

export function isAiChatConfigured(): boolean {
  return (
    isSupabaseConfigured() ||
    Boolean(cachedConfig.geminiApiKey) ||
    Boolean(cachedConfig.openAiApiKey) ||
    Boolean(process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim()) ||
    Boolean(process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim())
  );
}

export function getActiveProviderLabel(config?: AiConfig): string {
  const c = config || cachedConfig;
  if (c.provider === "gemini") {
    return "Google Gemini";
  }
  if (c.provider === "openai") {
    return "OpenAI ChatGPT";
  }
  if (c.provider === "supabase") {
    return "MediMate AI (Supabase)";
  }
  if (c.geminiApiKey) {
    return "Google Gemini";
  }
  if (c.openAiApiKey) {
    return "OpenAI ChatGPT";
  }
  if (isSupabaseConfigured()) {
    return "MediMate AI (Supabase)";
  }
  return "Google Gemini / ChatGPT";
}

export async function requestGeminiReply(
  messages: AiChatMessage[],
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  signal?: AbortSignal,
): Promise<string> {
  const selectedModel = resolveGeminiModel(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey.trim()}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: {
      parts: [{ text: MEDIMATE_AI_SYSTEM_PROMPT }],
    },
    contents,
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 1200,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new Error("Google Gemini returned an unreadable response.");
  }

  if (!response.ok) {
    const errorMsg = result?.error?.message;
    const errorCode = result?.error?.code;
    const errorStatus = result?.error?.status;

    if (
      errorStatus === "INVALID_ARGUMENT" ||
      (typeof errorMsg === "string" && errorMsg.includes("API key not valid"))
    ) {
      throw new Error(
        "Google Gemini API key is invalid. Please check your key in AI Settings.",
      );
    }
    if (errorCode === 429 || errorStatus === "RESOURCE_EXHAUSTED") {
      throw new Error(
        "Google Gemini rate limit was reached. Please wait a moment and try again.",
      );
    }
    if (errorCode === 404) {
      throw new Error(
        `Google Gemini model '${selectedModel}' is unavailable or not found. Please check your model configuration in AI Settings.`,
      );
    }
    throw new Error(
      typeof errorMsg === "string"
        ? `Gemini: ${errorMsg}`
        : "Google Gemini could not answer. Please try again.",
    );
  }

  const reply = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("Google Gemini returned an empty reply.");
  }

  return reply.trim();
}

export async function requestOpenAiReply(
  messages: AiChatMessage[],
  apiKey: string,
  model: string = "gpt-4o-mini",
  signal?: AbortSignal,
): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";
  const body = {
    model: model.trim() || "gpt-4o-mini",
    messages: [
      { role: "system", content: MEDIMATE_AI_SYSTEM_PROMPT },
      ...messages,
    ],
    temperature: 0.5,
    max_tokens: 1200,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new Error("OpenAI returned an unreadable response.");
  }

  if (!response.ok) {
    const code = result?.error?.code;
    if (code === "invalid_api_key" || response.status === 401) {
      throw new Error(
        "OpenAI rejected its configured API key. Update OPENAI_API_KEY in AI Settings.",
      );
    }
    if (
      code === "insufficient_quota" ||
      code === "rate_limit_exceeded" ||
      response.status === 429
    ) {
      throw new Error(
        "OpenAI's usage or rate limit was reached. Check billing and limits, or switch to Gemini in AI Settings.",
      );
    }
    throw new Error(
      typeof result?.error?.message === "string"
        ? result.error.message
        : "OpenAI could not answer. Please try again.",
    );
  }

  const reply = result?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("OpenAI returned an empty reply.");
  }

  return reply.trim();
}

export async function requestSupabaseChatReply(
  messages: AiChatMessage[],
  signal: AbortSignal,
): Promise<string> {
  const { accessToken, configuration } = await getSupabaseChatSession();
  const endpoint = `${configuration.url}/functions/v1/chatwithme`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: configuration.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("The AI chat server returned an invalid response.");
  }

  if (!isAiChatResponse(result)) {
    throw new Error("The AI chat server returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "The Supabase chat function could not answer. Please try again.",
    );
  }

  if (typeof result.reply !== "string" || !result.reply.trim()) {
    throw new Error("The AI chat server returned an empty reply.");
  }

  return result.reply.trim();
}

export async function requestAiChatReply(
  messages: AiChatMessage[],
  signal: AbortSignal,
): Promise<string> {
  const config = await getAiConfig();

  // 1. Explicit Gemini selection
  if (config.provider === "gemini") {
    if (!config.geminiApiKey) {
      throw new Error(
        "Google Gemini is selected but no API key is provided. Tap ⚙️ AI Settings to add your free Gemini key.",
      );
    }
    return requestGeminiReply(
      messages,
      config.geminiApiKey,
      config.geminiModel,
      signal,
    );
  }

  // 2. Explicit OpenAI selection
  if (config.provider === "openai") {
    if (!config.openAiApiKey) {
      throw new Error(
        "OpenAI ChatGPT is selected but no API key is provided. Tap ⚙️ AI Settings to add your OpenAI key.",
      );
    }
    return requestOpenAiReply(
      messages,
      config.openAiApiKey,
      config.openAiModel,
      signal,
    );
  }

  // 3. Auto mode:
  // If user configured a direct Gemini API key, use Gemini!
  // Gemini free tier is generous (1,500 requests/day, no credit card required)
  if (config.geminiApiKey) {
    try {
      return await requestGeminiReply(
        messages,
        config.geminiApiKey,
        config.geminiModel,
        signal,
      );
    } catch (err: any) {
      if (signal.aborted) throw err;
      if (err?.message?.includes("invalid")) throw err;
      if (!isSupabaseConfigured() && !config.openAiApiKey) throw err;
      console.warn("Direct Gemini failed, attempting fallback:", err);
    }
  }

  // If user configured a direct OpenAI API key
  if (config.openAiApiKey) {
    try {
      return await requestOpenAiReply(
        messages,
        config.openAiApiKey,
        config.openAiModel,
        signal,
      );
    } catch (err: any) {
      if (signal.aborted) throw err;
      if (err?.message?.includes("invalid")) throw err;
      if (!isSupabaseConfigured()) throw err;
      console.warn("Direct OpenAI failed, attempting Supabase fallback:", err);
    }
  }

  // 4. Try Supabase Edge Function
  if (isSupabaseConfigured()) {
    try {
      return await requestSupabaseChatReply(messages, signal);
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // If server hits OpenAI usage/rate limit (the error from the screenshot):
      if (
        errMsg.includes("usage or rate limit was reached") ||
        errMsg.includes("insufficient_quota") ||
        errMsg.includes("no available API quota")
      ) {
        // If Gemini is available, seamlessly use Gemini!
        if (config.geminiApiKey) {
          return requestGeminiReply(
            messages,
            config.geminiApiKey,
            config.geminiModel,
            signal,
          );
        }
        // Guide the user with clear instructions
        throw new Error(
          "OpenAI's usage or rate limit was reached. Tap 'Configure Free Gemini AI' below to switch to Google Gemini (free API key, no credit card needed).",
        );
      }
      throw err;
    }
  }

  throw new Error(
    "No AI service is configured yet. Tap ⚙️ AI Settings to add a free Google Gemini key or configure Supabase.",
  );
}
