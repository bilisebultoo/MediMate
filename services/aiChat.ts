import { getSupabaseChatSession, isSupabaseConfigured } from "@/services/supabaseClient";

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiChatResponse = {
  error?: unknown;
  reply?: unknown;
};

function isAiChatResponse(value: unknown): value is AiChatResponse {
  return typeof value === "object" && value !== null;
}

export function isAiChatConfigured(): boolean {
  return isSupabaseConfigured();
}

export async function requestAiChatReply(
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
