import { serverEnv } from "@/lib/env.server";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sending is not configured. Set RESEND_API_KEY and EMAIL_FROM on the server.");
  }
}

export class EmailSendError extends Error {}

/** Sends one email through Resend's API. */
export async function sendEmail(message: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachment: { filename: string; base64: string };
}) {
  if (!serverEnv.RESEND_API_KEY) throw new EmailNotConfiguredError();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      reply_to: message.replyTo || undefined,
      subject: message.subject,
      text: message.text,
      attachments: [{ filename: message.attachment.filename, content: message.attachment.base64 }],
    }),
  });
  if (!res.ok) {
    console.error("Resend rejected an email", res.status, await res.text());
    throw new EmailSendError("The email could not be sent. Please try again.");
  }
}
