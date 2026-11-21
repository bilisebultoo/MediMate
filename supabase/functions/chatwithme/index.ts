import { withSupabase } from "npm:@supabase/server@1.9.2";

import { createChatHandler } from "../_shared/chatCore.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is required for ChatWithMe authentication.");
}

const issuer = new URL("/auth/v1", supabaseUrl).toString();

const handleChat = createChatHandler({
  getApiKey: () => Deno.env.get("OPENAI_API_KEY"),
  getModel: () => Deno.env.get("OPENAI_MODEL"),
  getGeminiApiKey: () => Deno.env.get("GEMINI_API_KEY"),
  getGeminiModel: () => Deno.env.get("GEMINI_MODEL"),
  getProvider: () => Deno.env.get("AI_PROVIDER"),
});

export default {
  fetch: withSupabase(
    { auth: "user", issuer, audience: "authenticated" },
    async (request, context) => {
      if (!context.userClaims?.id) {
        return Response.json(
          { error: "A signed-in chat session is required." },
          {
            status: 401,
          },
        );
      }
      return handleChat(request);
    },
  ),
};
