import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QR_IMAGE_OPTIONS } from "@/lib/invoice-qr";

export function ZatcaQrCode({
  payload,
  size = 200,
  className,
}: {
  payload: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload, { ...QR_IMAGE_OPTIONS, width: size * 2 }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label="ZATCA invoice QR code"
    >
      {src ? (
        <img src={src} alt="" width={size} height={size} className="h-full w-full" />
      ) : (
        <div className="h-full w-full animate-pulse rounded bg-neutral-100" />
      )}
    </div>
  );
}
