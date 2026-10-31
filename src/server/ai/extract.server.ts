import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { ExtractionSchema, type AcceptedDocumentType, type Extraction } from "@/lib/extraction";
import { FALLBACK, MODEL, getClaude } from "./claude.server";

const SYSTEM = `You read invoices and related business documents from Saudi Arabia and return their contents as structured data.

Read every field exactly as printed. Never invent values: when a field is missing or unreadable, return null and say so in warnings. Documents are often bilingual Arabic and English; read both and prefer whichever is clearer. Arabic-Indic digits must be converted to Western digits.

Dates must be Gregorian YYYY-MM-DD. If only a Hijri date is printed, return null for that date and add a warning rather than converting it.

The seller is the business issuing the document; the buyer is the customer it is addressed to.`;

export class ExtractionRefusedError extends Error {}
export class ExtractionUnreadableError extends Error {}

/** Sends one document to Claude and returns validated structured data. */
export async function extractInvoiceData(input: {
  mediaType: AcceptedDocumentType;
  base64: string;
}): Promise<Extraction> {
  const client = getClaude();
  const documentBlock: Anthropic.Beta.BetaContentBlockParam =
    input.mediaType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: input.base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: input.mediaType, data: input.base64 },
        };

  const response = await client.beta.messages.parse({
    ...FALLBACK,
    betas: [...FALLBACK.betas],
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    // Reading numbers off a tax document is accuracy-sensitive.
    output_config: { effort: "high", format: betaZodOutputFormat(ExtractionSchema) },
    messages: [
      {
        role: "user",
        content: [documentBlock, { type: "text", text: "Extract this document." }],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractionRefusedError("The AI service declined to read this document.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new ExtractionUnreadableError(
      "The document couldn't be read completely. Try a clearer or shorter document.",
    );
  }
  return response.parsed_output;
}
