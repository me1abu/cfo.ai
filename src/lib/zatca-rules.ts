/**
 * Saudi e-invoicing rules, each tied to a published ZATCA source.
 */

/**
 * Seller and buyer VAT registration numbers: 15 digits, first and last digit "3".
 * Source: ZATCA Electronic Invoice XML Implementation Standard v1.2,
 * business rules BR-KSA-40 (seller) and BR-KSA-44 (buyer, non-export).
 */
export function isValidSaudiVatNumber(value: string): boolean {
  return /^3\d{13}3$/.test(value.trim());
}
