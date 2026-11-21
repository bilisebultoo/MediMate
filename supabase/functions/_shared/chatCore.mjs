const OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";
const GEMINI_CHAT_COMPLETIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 12;
const MAX_USER_MESSAGE_LENGTH = 2000;
const MAX_ASSISTANT_MESSAGE_LENGTH = 6000;
const MAX_PROVIDER_ERROR_MESSAGE_LENGTH = 240;
const MAX_PROVIDER_ERROR_SOURCE_LENGTH = 2048;

const SYSTEM_MESSAGE =
  "You are MediMate, a helpful general-purpose conversational assistant. " +
  "Answer questions about education, technology, science, everyday life, and general health in a clear, natural, understandable way. " +
  "Give enough detail to explain the answer, use examples or steps when useful, and preserve context from earlier messages in this conversation. " +
  "You cannot access MediMate records; if asked about them, say so and direct the user to the local summary buttons. " +
  "For health and medication questions, provide general educational information only: do not diagnose, prescribe, or recommend changing a person's treatment plan or medication dose. " +
  "For missed-dose questions, direct the user to the medicine's official instructions or a pharmacist/prescriber. " +
  "For potentially urgent symptoms, advise contacting local emergency services or urgent medical care. " +
  "Be transparent about uncertainty and do not invent facts.";

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readLimitedBody(request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { tooLarge: true };
  }

  const reader = request.body?.getReader();
  if (!reader) return { text: "", tooLarge: false };

  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), tooLarge: false };
}

function validateMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return { error: "Send between 1 and 12 chat messages." };
  }

  const messages = [];
  for (const message of value) {
    if (
      typeof message !== "object" ||
      message === null ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      return { error: "Chat messages have an invalid format." };
    }

    const content = message.content.trim();
    const limit =
      message.role === "user"
        ? MAX_USER_MESSAGE_LENGTH
        : MAX_ASSISTANT_MESSAGE_LENGTH;
    if (!content || content.length > limit) {
      return {
        error: `Each ${message.role} message must be 1 to ${limit} characters.`,
      };
    }
    messages.push({ role: message.role, content });
  }

  if (messages[messages.length - 1].role !== "user") {
    return { error: "The latest chat message must be from the user." };
  }

  return { messages };
}

function getProviderErrorCode(errorBody) {
  const code = errorBody?.error?.code;
  return typeof code === "string" && /^[a-z0-9_]{1,64}$/.test(code)
    ? code
    : undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactExactValue(message, value) {
  if (!value) return message;
  return message.replace(
    new RegExp(escapeRegExp(value), "gi"),
    "[redacted]",
  );
}

function getSafeProviderErrorMessage(errorBody, messages, apiKey) {
  const providerMessage = errorBody?.error?.message;
  if (typeof providerMessage !== "string") return "unavailable";

  let safeMessage = providerMessage
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, MAX_PROVIDER_ERROR_SOURCE_LENGTH);
  for (const message of messages) {
    safeMessage = redactExactValue(safeMessage, message.content);
  }
  safeMessage = redactExactValue(safeMessage, apiKey)
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|rk|sb_secret)_[A-Za-z0-9_-]+\b/gi, "[redacted]");

  return safeMessage.slice(0, MAX_PROVIDER_ERROR_MESSAGE_LENGTH);
}

function getProviderErrorMessage(status, code) {
  if (code === "invalid_api_key" || status === 401) {
    return "OpenAI rejected its configured API key. Update OPENAI_API_KEY in Supabase Edge Function Secrets.";
  }
  if (code === "insufficient_quota") {
    return "The OpenAI account has no available API quota. Check its billing and usage limits.";
  }
  if (code === "rate_limit_exceeded" || status === 429) {
    return "OpenAI's usage or rate limit was reached. Check billing and limits, or try again later.";
  }
  if (code === "model_not_found") {
    return "The configured OpenAI model is unavailable to this account. Check OPENAI_MODEL in Supabase Edge Function Secrets.";
  }
  return "The AI service could not answer. Please try again.";
}

function getGeminiErrorMessage(status, code) {
  if (code === "invalid_api_key" || status === 400 || status === 401) {
    return "Google Gemini rejected its configured API key. Update GEMINI_API_KEY in Supabase Edge Function Secrets.";
  }
  if (code === "insufficient_quota") {
    return "The Google Gemini account has no available API quota. Check its billing and usage limits.";
  }
  if (code === "rate_limit_exceeded" || code === "RESOURCE_EXHAUSTED" || status === 429) {
    return "Google Gemini's usage or rate limit was reached. Check limits, or try again later.";
  }
  if (code === "model_not_found" || status === 404) {
    return "The configured Google Gemini model is unavailable. Check GEMINI_MODEL in Supabase Edge Function Secrets.";
  }
  return "The Gemini AI service could not answer. Please try again.";
}

/**
 * @param {object} options
 * @param {() => string | undefined} [options.getApiKey]
 * @param {() => string | undefined} [options.getModel]
 * @param {() => string | undefined} [options.getGeminiApiKey]
 * @param {() => string | undefined} [options.getGeminiModel]
 * @param {() => string | undefined} [options.getProvider]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createChatHandler({
  getApiKey,
  getModel,
  getGeminiApiKey,
  getGeminiModel,
  getProvider,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (
    (typeof getApiKey !== "function" && typeof getGeminiApiKey !== "function") ||
    typeof fetchImpl !== "function"
  ) {
    throw new Error("Chat handler requires an API-key provider and fetch.");
  }

  async function callUpstreamProvider({
    url,
    apiKey,
    model,
    messages,
    providerName,
    errorFormatter,
  }) {
    const upstream = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_MESSAGE },
          ...messages,
        ],
        max_tokens: 1200,
        model,
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!upstream.ok) {
      let errorBody;
      try {
        errorBody = await upstream.json();
      } catch {
        errorBody = null;
      }
      const code = getProviderErrorCode(errorBody);
      const providerMessage = getSafeProviderErrorMessage(
        errorBody,
        messages,
        apiKey,
      );
      console.error(
        `${providerName} returned HTTP status:`,
        upstream.status,
        "error code:",
        code ?? "unknown",
        "error message:",
        providerMessage,
      );
      return {
        ok: false,
        status: upstream.status,
        code,
        error: errorFormatter(upstream.status, code),
      };
    }

    const result = await upstream.json();
    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      console.error(`${providerName} returned an invalid chat response.`);
      return {
        ok: false,
        status: 502,
        error: `The ${providerName} service returned an invalid response.`,
      };
    }

    return { ok: true, reply: reply.trim() };
  }

  return async function handleChatRequest(request) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    let bodyContent;
    try {
      bodyContent = await readLimitedBody(request);
    } catch {
      return jsonResponse({ error: "Could not read the chat request." }, 400);
    }
    if (bodyContent.tooLarge) {
      return jsonResponse({ error: "Request is too large." }, 413);
    }

    let body;
    try {
      body = JSON.parse(bodyContent.text);
    } catch {
      return jsonResponse({ error: "Request must contain valid JSON." }, 400);
    }

    const { messages, error } = validateMessages(body?.messages);
    if (error) return jsonResponse({ error }, 400);

    const openAiApiKey = typeof getApiKey === "function" ? getApiKey() : undefined;
    const geminiApiKey = typeof getGeminiApiKey === "function" ? getGeminiApiKey() : undefined;
    const preferredProvider = typeof getProvider === "function" ? getProvider()?.trim().toLowerCase() : "auto";

    if (!openAiApiKey && !geminiApiKey) {
      return jsonResponse(
        { error: "OpenAI is not configured for this Supabase project." },
        503,
      );
    }

    const useGemini =
      (preferredProvider === "gemini" && geminiApiKey) ||
      (!openAiApiKey && geminiApiKey);

    try {
      if (useGemini) {
        const rawModel = getGeminiModel?.()?.trim();
        const model =
          rawModel && rawModel !== "gemini-1.5-flash" && rawModel !== "gemini-2.0-flash"
            ? rawModel
            : "gemini-3.5-flash-lite";
        const result = await callUpstreamProvider({
          url: GEMINI_CHAT_COMPLETIONS_URL,
          apiKey: geminiApiKey,
          model,
          messages,
          providerName: "Gemini",
          errorFormatter: getGeminiErrorMessage,
        });

        if (!result.ok) {
          // If Gemini failed and OpenAI is available, try fallback
          if (openAiApiKey) {
            console.log("Gemini failed, falling back to OpenAI...");
            const openAiModel = getModel?.()?.trim() || "gpt-4o-mini";
            const fallbackResult = await callUpstreamProvider({
              url: OPENAI_CHAT_COMPLETIONS_URL,
              apiKey: openAiApiKey,
              model: openAiModel,
              messages,
              providerName: "OpenAI",
              errorFormatter: getProviderErrorMessage,
            });
            if (fallbackResult.ok) {
              return jsonResponse({ reply: fallbackResult.reply });
            }
          }
          return jsonResponse({ error: result.error }, 502);
        }

        return jsonResponse({ reply: result.reply });
      }

      // Default: call OpenAI
      const model = getModel?.()?.trim() || "gpt-4o-mini";
      const result = await callUpstreamProvider({
        url: OPENAI_CHAT_COMPLETIONS_URL,
        apiKey: openAiApiKey,
        model,
        messages,
        providerName: "OpenAI",
        errorFormatter: getProviderErrorMessage,
      });

      if (!result.ok) {
        // Fallback from OpenAI to Gemini if rate limit / quota exceeded
        if (
          geminiApiKey &&
          (result.status === 429 ||
            result.code === "insufficient_quota" ||
            result.code === "rate_limit_exceeded")
        ) {
          console.log("OpenAI rate limit/quota reached; falling back to Gemini...");
          const rawGeminiModel = getGeminiModel?.()?.trim();
          const geminiModel =
            rawGeminiModel && rawGeminiModel !== "gemini-1.5-flash" && rawGeminiModel !== "gemini-2.0-flash"
              ? rawGeminiModel
              : "gemini-3.5-flash-lite";
          const geminiResult = await callUpstreamProvider({
            url: GEMINI_CHAT_COMPLETIONS_URL,
            apiKey: geminiApiKey,
            model: geminiModel,
            messages,
            providerName: "Gemini",
            errorFormatter: getGeminiErrorMessage,
          });
          if (geminiResult.ok) {
            return jsonResponse({ reply: geminiResult.reply });
          }
        }
        return jsonResponse({ error: result.error }, 502);
      }

      return jsonResponse({ reply: result.reply });
    } catch (cause) {
      const timedOut = cause?.name === "TimeoutError";
      console.error(
        timedOut ? "AI request timed out." : "AI request failed.",
        cause,
      );
      return jsonResponse(
        {
          error: timedOut
            ? "The AI service took too long to respond. Please try again."
            : "The AI service could not be reached. Please try again.",
        },
        timedOut ? 504 : 502,
      );
    }
  };
}
