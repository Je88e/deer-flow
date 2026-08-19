/**
 * React bindings for the iframe bridge (see ./iframe-bridge-client).
 *
 * SSR-safe: `useBridgeClient` returns null until the component has mounted in
 * a browser, so rendering on the server never touches `window`. In a
 * standalone (non-iframe) deployment the client stays null forever and every
 * hook here is inert.
 */

import { useEffect, useState } from "react";

import { type HandshakePayload } from "./bridge-protocol";
import {
  type IframeBridgeClient,
  getIframeBridgeClient,
} from "./iframe-bridge-client";

export type BridgeHandshakeState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ready"; handshake: HandshakePayload }
  | { status: "error"; error: Error };

/**
 * The shared bridge client, or null on the server and in standalone mode.
 * Null on the first client render (matching SSR output) and updated from an
 * effect after mount, which keeps hydration consistent.
 */
export function useBridgeClient(): IframeBridgeClient | null {
  const [client, setClient] = useState<IframeBridgeClient | null>(null);

  useEffect(() => {
    setClient(getIframeBridgeClient());
  }, []);

  return client;
}

/**
 * Drive the bridge handshake and expose its state. Stays "idle" while there is
 * no client (SSR / standalone); errors carry the rejection (timeout or
 * not-embedded) so the caller can fall back to full mode.
 */
export function useBridgeHandshake(): BridgeHandshakeState {
  const client = useBridgeClient();
  const [state, setState] = useState<BridgeHandshakeState>({ status: "idle" });

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    setState({ status: "pending" });
    client.handshake().then(
      (handshake) => {
        if (!cancelled) {
          setState({ status: "ready", handshake });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", error: toError(error) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  return state;
}

/**
 * Invoke `handler` whenever the Shell sends LOGOUT. Inert while there is no
 * client. The handler re-subscribes whenever its identity changes, so pass a
 * stable reference when the callback is not trivial.
 */
export function useBridgeLogout(handler: () => void): void {
  const client = useBridgeClient();

  useEffect(() => {
    if (!client) {
      return;
    }
    return client.onLogout(handler);
  }, [client, handler]);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
