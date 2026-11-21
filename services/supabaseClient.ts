import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseConfiguration = {
  publishableKey: string;
  url: string;
};

let client: SupabaseClient | null = null;
let configuration: SupabaseConfiguration | null = null;

function readSupabaseConfiguration(): SupabaseConfiguration {
  const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set the project URL and publishable key.",
    );
  }
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error(
      "Use the Supabase publishable key in the app, never a secret key.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("The Supabase project URL is invalid.");
  }

  const isLoopbackHttp =
    parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "localhost" ||
      parsedUrl.hostname === "127.0.0.1");
  if (parsedUrl.protocol !== "https:" && !isLoopbackHttp) {
    throw new Error("The Supabase project URL must use HTTPS.");
  }
  if (parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash) {
    throw new Error("Use the Supabase project URL without a path or query.");
  }

  return { publishableKey, url: parsedUrl.origin };
}

export function isSupabaseConfigured(): boolean {
  try {
    readSupabaseConfiguration();
    return true;
  } catch {
    return false;
  }
}

export function getSupabaseClient(): SupabaseClient {
  const nextConfiguration = readSupabaseConfiguration();
  if (
    !client ||
    !configuration ||
    configuration.url !== nextConfiguration.url ||
    configuration.publishableKey !== nextConfiguration.publishableKey
  ) {
    configuration = nextConfiguration;
    client = createClient(configuration.url, configuration.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: AsyncStorage,
      },
    });
  }
  return client;
}

export async function getSupabaseChatSession(): Promise<{
  accessToken: string;
  configuration: SupabaseConfiguration;
}> {
  const currentConfiguration = readSupabaseConfiguration();
  const supabase = getSupabaseClient();
  const existing = await supabase.auth.getSession();
  if (existing.error) {
    throw new Error("Could not read the Supabase chat session.");
  }

  let session = existing.data.session;
  if (!session) {
    const anonymous = await supabase.auth.signInAnonymously();
    if (anonymous.error) {
      throw new Error(
        "Could not create a chat session. Check that anonymous sign-ins are enabled in Supabase Auth.",
      );
    }
    session = anonymous.data.session;
  }

  if (!session?.access_token) {
    throw new Error("Supabase did not return a valid chat session.");
  }

  return {
    accessToken: session.access_token,
    configuration: currentConfiguration,
  };
}
