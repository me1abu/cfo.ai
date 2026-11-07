import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./context";
import { ZatcaRequestError, ZatcaUnavailableError } from "./zatca/api.server";
import { ZatcaOnboardingError, getUnit, onboard, submitToZatca } from "./zatca/service.server";
import { ZatcaNotConfiguredError } from "./zatca/vault.server";

export const getZatcaConnection = createServerFn({ method: "GET" }).handler(async () => {
  const { orgId } = await requireUser();
  const unit = await getUnit(orgId);
  if (!unit) return null;
  return {
    environment: unit.environment,
    commonName: unit.commonName,
    certificateExpiresAt: unit.certificateExpiresAt.toISOString(),
    documentsSent: unit.lastCounter,
  };
});

// ZATCA's CSR rules forbid these characters in names (SDK specialCharacterRegex).
const csrText = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^!@#$%&*_<=]+$/, "Remove these characters: ! @ # $ % & * _ < =");

export const connectZatca = createServerFn({ method: "POST" })
  .validator(
    z.object({
      otp: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "The OTP is 6 digits"),
      branch: csrText,
      industry: csrText,
    }),
  )
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    if (await getUnit(orgId)) {
      return { ok: false as const, error: "This company is already connected to ZATCA." };
    }
    try {
      await onboard(orgId, data);
      return { ok: true as const };
    } catch (err) {
      if (
        err instanceof ZatcaOnboardingError ||
        err instanceof ZatcaRequestError ||
        err instanceof ZatcaNotConfiguredError
      ) {
        return { ok: false as const, error: err.message };
      }
      if (err instanceof ZatcaUnavailableError) {
        return {
          ok: false as const,
          error: "ZATCA can't be reached right now. Try again shortly.",
        };
      }
      console.error("ZATCA onboarding failed", err);
      return { ok: false as const, error: "Connecting to ZATCA failed. Please try again." };
    }
  });

/** Sends a document that is still waiting for ZATCA's answer. */
export const retryZatcaSubmission = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId } = await requireUser();
    return submitToZatca(orgId, data.id);
  });
