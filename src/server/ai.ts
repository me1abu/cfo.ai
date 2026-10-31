import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./context";
import {
  ACCEPTED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  checkExtractedInvoice,
} from "@/lib/extraction";
import { friendlyAiError } from "./ai/claude.server";
import {
  ExtractionRefusedError,
  ExtractionUnreadableError,
  extractInvoiceData,
} from "./ai/extract.server";
import { AssistantRefusedError, runAssistant } from "./ai/assistant.server";

// Base64 is 4/3 the size of the file; allow a little slack for padding.
const MAX_BASE64_CHARS = Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 16;

const documentInput = z.object({
  fileName: z.string().max(255),
  mediaType: z.enum(ACCEPTED_DOCUMENT_TYPES),
  base64: z
    .string()
    .min(1)
    .max(MAX_BASE64_CHARS, `Files must be ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB or smaller.`)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "File data is not valid Base64"),
});

function extractionError(err: unknown) {
  if (err instanceof ExtractionRefusedError || err instanceof ExtractionUnreadableError) {
    return err.message;
  }
  console.error("AI extraction failed", err);
  return friendlyAiError(err);
}

/** Reads an uploaded document with AI and returns its invoice fields for review. */
export const extractDocument = createServerFn({ method: "POST" })
  .validator(documentInput)
  .handler(async ({ data }) => {
    await requireUser();
    try {
      const extraction = await extractInvoiceData(data);
      return { ok: true as const, extraction };
    } catch (err) {
      return { ok: false as const, error: extractionError(err) };
    }
  });

/** Reads a received invoice with AI and checks it against ZATCA rules and its own arithmetic. */
export const checkDocument = createServerFn({ method: "POST" })
  .validator(documentInput)
  .handler(async ({ data }) => {
    await requireUser();
    try {
      const extraction = await extractInvoiceData(data);
      const today = new Date().toISOString().slice(0, 10);
      return { ok: true as const, extraction, report: checkExtractedInvoice(extraction, today) };
    } catch (err) {
      return { ok: false as const, error: extractionError(err) };
    }
  });

/** One turn of the in-app assistant. The client sends the visible conversation so far. */
export const askAssistant = createServerFn({ method: "POST" })
  .validator(
    z.object({
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(4000),
          }),
        )
        .min(1)
        .max(20)
        .refine((m) => m[0].role === "user" && m[m.length - 1].role === "user", {
          message: "The conversation must start and end with a user message.",
        }),
    }),
  )
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    try {
      return { ok: true as const, reply: await runAssistant(orgId, data.messages) };
    } catch (err) {
      if (err instanceof AssistantRefusedError) return { ok: false as const, error: err.message };
      console.error("AI assistant failed", err);
      return { ok: false as const, error: friendlyAiError(err) };
    }
  });
