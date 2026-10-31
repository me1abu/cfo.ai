/**
 * Shared Claude configuration. Server-only: the API key never reaches the browser.
 */
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env.server";

/** One place to change the model. */
export const MODEL = "claude-opus-5-5";

/**
 * Server-side refusal fallback: if the model's safety classifiers decline a request, the API
 * re-runs it on Anthropic's recommended fallback model inside the same call. Uses the beta
 * endpoint (client.beta.messages.*).
 */
export const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
} as const;

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI features are not configured. Set ANTHROPIC_API_KEY on the server.");
  }
}

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!serverEnv.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  client ??= new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
  return client;
}

/** Maps SDK errors to messages safe to show users. Never leaks request details. */
export function friendlyAiError(err: unknown): string {
  if (err instanceof AiNotConfiguredError) return err.message;
  if (err instanceof Anthropic.RateLimitError) {
    return "The AI service is busy right now. Please try again in a minute.";
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return "The AI service rejected the server's credentials. Check ANTHROPIC_API_KEY.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return "The AI service couldn't process this request. Try a different or smaller file.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the AI service. Check the server's internet connection.";
  }
  if (err instanceof Anthropic.APIError) {
    return "The AI service returned an error. Please try again.";
  }
  return "Something went wrong while talking to the AI service.";
}
