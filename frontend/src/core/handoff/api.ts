import { getBackendBaseURL } from "../config";

export type RedeemHandoffResponse = {
  thread_id: string;
  run_id: string;
  expires_at: string;
};

async function readErrorDetail(
  response: Response,
  fallback: string,
): Promise<string> {
  const error = await response.json().catch(() => ({ detail: fallback }));
  return error.detail ?? fallback;
}

export async function redeemHandoff(
  token: string,
): Promise<RedeemHandoffResponse> {
  const response = await fetch(`${getBackendBaseURL()}/api/handoff/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorDetail(response, "Failed to redeem handoff token"),
    );
  }

  return response.json();
}
