import { z } from "zod";
import type { NationalAddress } from "./invoice-math";

export const EMPTY_NATIONAL_ADDRESS: NationalAddress = {
  street: "",
  building: "",
  district: "",
  city: "",
  postalCode: "",
};

export const nationalAddressInput = z
  .object({
    street: z.string().trim().max(200),
    building: z.string().trim().max(20),
    district: z.string().trim().max(200),
    city: z.string().trim().max(200),
    postalCode: z.string().trim().max(20),
  })
  .nullable()
  .default(null);

/** What's wrong with an address for ZATCA: BR-KSA-37 (building) and BR-KSA-66 (postal code). */
export function nationalAddressProblems(a: NationalAddress | null | undefined): string[] {
  if (!a) return ["National Address"];
  const problems: string[] = [];
  if (!a.street.trim()) problems.push("street");
  if (!/^\d{4}$/.test(a.building.trim())) problems.push("4-digit building number");
  if (!a.district.trim()) problems.push("district");
  if (!a.city.trim()) problems.push("city");
  if (!/^\d{5}$/.test(a.postalCode.trim())) problems.push("5-digit postal code");
  return problems;
}
