import { Input } from "@/components/ui/input";
import type { NationalAddress } from "@/lib/invoice-math";
import { EMPTY_NATIONAL_ADDRESS } from "@/lib/national-address";

const FIELDS: { key: keyof NationalAddress; label: string }[] = [
  { key: "building", label: "Building no. (4 digits)" },
  { key: "street", label: "Street" },
  { key: "district", label: "District" },
  { key: "city", label: "City" },
  { key: "postalCode", label: "Postal code (5 digits)" },
];

export function NationalAddressFields({
  value,
  onChange,
}: {
  value: NationalAddress | null | undefined;
  onChange: (next: NationalAddress) => void;
}) {
  const address = value ?? EMPTY_NATIONAL_ADDRESS;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {FIELDS.map(({ key, label }) => (
        <Input
          key={key}
          aria-label={label}
          placeholder={label}
          value={address[key]}
          onChange={(e) => onChange({ ...address, [key]: e.target.value })}
          data-testid={`address-${key}`}
        />
      ))}
    </div>
  );
}
