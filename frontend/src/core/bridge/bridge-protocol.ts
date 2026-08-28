/**
 * Vendored iframe bridge protocol (zod schemas).
 *
 * This file is a zod reconstruction of the message set finalized on 2026-08-18
 * in the WitAI x WIT Shell integration plan (§5.1). The authoritative source
 * is the Shell repository's `packages/platform-sdk/src/iframe-bridge.ts` (zod
 * schema), which is not available locally: when the Shell repo is reachable,
 * every field below must be aligned with it field by field. Protocol evolution
 * is announced and synced from the Shell side.
 *
 * Exactly the seven finalized messages exist here. Phase 1.5 messages
 * (NAVIGATE, THEME_CHANGE, LOCALE_CHANGE, TITLE_CHANGE, NAVIGATION_REQUEST)
 * are deliberately absent — they must first extend the Shell-side schema.
 *
 * Envelope: every message, including upstream (WitAI -> Shell) ones, carries
 * `version: "1.0"` at the top level of the message. The version never lives
 * inside the HANDSHAKE payload.
 *
 * Object schemas intentionally keep zod's default of ignoring unknown keys:
 * known fields are validated strictly, while additive extras from the Shell
 * side do not break parsing within the same protocol version.
 */

import { z } from "zod";

export const BRIDGE_PROTOCOL_VERSION = "1.0";

const versionSchema = z.literal(BRIDGE_PROTOCOL_VERSION);
const emptyPayloadSchema = z.object({});

// ---- Shell -> WitAI (downstream) payloads ----

export const handshakePayloadSchema = z.object({
  mode: z.literal("embed"),
  capabilities: z.array(z.string()),
});

export const authTokenPayloadSchema = z.object({
  token: z.string(),
  tokenType: z.literal("keycloak-jwt"),
  provider: z.literal("keycloak"),
});

export const logoutPayloadSchema = emptyPayloadSchema;

// ---- WitAI -> Shell (upstream) payloads ----

export const handshakeRequestPayloadSchema = emptyPayloadSchema;

export const authTokenRequestPayloadSchema = z.object({
  reason: z.string().optional(),
});

export const readyPayloadSchema = z.object({
  threadId: z.string(),
});

export const authFailedPayloadSchema = z.object({
  error: z.string(),
  code: z.string(),
});

// ---- Message envelopes ----

export const handshakeMessageSchema = z.object({
  version: versionSchema,
  type: z.literal("HANDSHAKE"),
  payload: handshakePayloadSchema,
});

export const authTokenMessageSchema = z.object({
  version: versionSchema,
  type: z.literal("AUTH_TOKEN"),
  payload: authTokenPayloadSchema,
});

export const logoutMessageSchema = z.object({
  version: versionSchema,
  type: z.literal("LOGOUT"),
  payload: logoutPayloadSchema,
});

export const handshakeRequestMessageSchema = z.object({
  version: versionSchema,
  type: z.literal("HANDSHAKE_REQUEST"),
  payload: handshakeRequestPayloadSchema,
});

export const authTokenRequestMessageSchema = z.object({
  version: versionSchema,
  type: z.literal("AUTH_TOKEN_REQUEST"),
  payload: authTokenRequestPayloadSchema,
});

export const readyMessageSchema = z.object({
  version: versionSchema,
  type: z.literal("READY"),
  payload: readyPayloadSchema,
});

export const authFailedMessageSchema = z.object({
  version: versionSchema,
  type: z.literal("AUTH_FAILED"),
  payload: authFailedPayloadSchema,
});

export const bridgeMessageSchema = z.discriminatedUnion("type", [
  handshakeMessageSchema,
  authTokenMessageSchema,
  logoutMessageSchema,
  handshakeRequestMessageSchema,
  authTokenRequestMessageSchema,
  readyMessageSchema,
  authFailedMessageSchema,
]);

// ---- Inferred types (no parallel hand-written definitions) ----

export type HandshakePayload = z.infer<typeof handshakePayloadSchema>;
export type AuthTokenPayload = z.infer<typeof authTokenPayloadSchema>;
export type LogoutPayload = z.infer<typeof logoutPayloadSchema>;
export type HandshakeRequestPayload = z.infer<
  typeof handshakeRequestPayloadSchema
>;
export type AuthTokenRequestPayload = z.infer<
  typeof authTokenRequestPayloadSchema
>;
export type ReadyPayload = z.infer<typeof readyPayloadSchema>;
export type AuthFailedPayload = z.infer<typeof authFailedPayloadSchema>;

export type HandshakeMessage = z.infer<typeof handshakeMessageSchema>;
export type AuthTokenMessage = z.infer<typeof authTokenMessageSchema>;
export type LogoutMessage = z.infer<typeof logoutMessageSchema>;
export type HandshakeRequestMessage = z.infer<
  typeof handshakeRequestMessageSchema
>;
export type AuthTokenRequestMessage = z.infer<
  typeof authTokenRequestMessageSchema
>;
export type ReadyMessage = z.infer<typeof readyMessageSchema>;
export type AuthFailedMessage = z.infer<typeof authFailedMessageSchema>;

export type BridgeMessage = z.infer<typeof bridgeMessageSchema>;
export type BridgeMessageType = BridgeMessage["type"];

/**
 * Validate an inbound postMessage payload. The caller must have checked
 * `event.origin` already; this checks the message shape and top-level version.
 *
 * Returns the parsed message, or `null` for any invalid input (wrong version,
 * unknown type, malformed payload, non-object input). Invalid input is dropped
 * by the caller instead of thrown, so parsing never throws by design.
 */
export function parseInbound(input: unknown): BridgeMessage | null {
  const result = bridgeMessageSchema.safeParse(input);
  return result.success ? result.data : null;
}

// ---- Upstream (WitAI -> Shell) message constructors ----
// Each helper stamps the top-level protocol version so callers cannot forget it.

export function handshakeRequestMessage(): HandshakeRequestMessage {
  return {
    version: BRIDGE_PROTOCOL_VERSION,
    type: "HANDSHAKE_REQUEST",
    payload: {},
  };
}

export function authTokenRequestMessage(
  reason?: string,
): AuthTokenRequestMessage {
  return {
    version: BRIDGE_PROTOCOL_VERSION,
    type: "AUTH_TOKEN_REQUEST",
    payload: reason === undefined ? {} : { reason },
  };
}

export function readyMessage(threadId: string): ReadyMessage {
  return {
    version: BRIDGE_PROTOCOL_VERSION,
    type: "READY",
    payload: { threadId },
  };
}

export function authFailedMessage(
  error: string,
  code: string,
): AuthFailedMessage {
  return {
    version: BRIDGE_PROTOCOL_VERSION,
    type: "AUTH_FAILED",
    payload: { error, code },
  };
}
