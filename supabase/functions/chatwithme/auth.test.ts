const projectUrl = "https://chat-auth-test.supabase.co";
const issuer = new URL("/auth/v1", projectUrl).toString();
const keyId = "chat-auth-test-key";
const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(encoder.encode(JSON.stringify(value)));
}

async function createToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = encodeJson({ alg: "ES256", kid: keyId, typ: "JWT" });
  const encodedPayload = encodeJson({
    sub: "chat-auth-test-user",
    role: "authenticated",
    iss: issuer,
    aud: "authenticated",
    iat: now,
    exp: now + 300,
    ...claims,
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      encoder.encode(signingInput),
    ),
  );
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

const signingKeys = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const otherSigningKeys = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const publicJwk = {
  ...await crypto.subtle.exportKey("jwk", signingKeys.publicKey),
  alg: "ES256",
  use: "sig",
  kid: keyId,
};

Deno.env.set("SUPABASE_URL", projectUrl);
Deno.env.set("SUPABASE_JWKS", JSON.stringify({ keys: [publicJwk] }));
Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
Deno.env.set("SUPABASE_SECRET_KEY", "sb_secret_test");

const { default: chatWithMe } = await import("./index.ts");

function createRequest(token?: string): Request {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return new Request(`${projectUrl}/functions/v1/chatwithme`, { headers });
}

async function assertUnauthorized(token?: string): Promise<void> {
  const response = await chatWithMe.fetch(createRequest(token));
  if (response.status !== 401) {
    throw new Error(`Expected HTTP 401, received ${response.status}.`);
  }
}

Deno.test("rejects requests without a bearer token", async () => {
  await assertUnauthorized();
});

Deno.test("accepts a valid project token and reaches the chat handler", async () => {
  const token = await createToken(signingKeys.privateKey);
  const response = await chatWithMe.fetch(
    new Request(`${projectUrl}/functions/v1/chatwithme`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  if (response.status !== 405) {
    throw new Error(
      `Expected authenticated handler HTTP 405, received ${response.status}.`,
    );
  }
});

Deno.test("rejects malformed tokens", async () => {
  await assertUnauthorized("not-a-jwt");
});

Deno.test("rejects expired tokens", async () => {
  const token = await createToken(signingKeys.privateKey, {
    exp: Math.floor(Date.now() / 1000) - 60,
  });
  await assertUnauthorized(token);
});

Deno.test("rejects tokens from another issuer", async () => {
  const token = await createToken(signingKeys.privateKey, {
    iss: "https://another-project.supabase.co/auth/v1",
  });
  await assertUnauthorized(token);
});

Deno.test("rejects tokens for another audience", async () => {
  const token = await createToken(signingKeys.privateKey, {
    aud: "another-audience",
  });
  await assertUnauthorized(token);
});

Deno.test("rejects tokens with an invalid signature", async () => {
  const token = await createToken(otherSigningKeys.privateKey);
  await assertUnauthorized(token);
});
