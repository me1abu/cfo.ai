import { createFileRoute } from "@tanstack/react-router";
import jsQR from "jsqr";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QrCode, UploadCloud, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { parseZatcaQr, QR_TAG_LABELS, ZatcaQrError, type ParsedQr } from "@/lib/zatca-qr";
import { isValidSaudiVatNumber } from "@/lib/zatca-rules";

export const Route = createFileRoute("/_app/qr-scanner")({
  head: () => ({
    meta: [
      { title: "QR Scanner · AI Invoice Saudi" },
      { name: "description", content: "Scan and decode ZATCA invoice QR codes." },
    ],
  }),
  component: QrScanner,
});

type Result =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "decoded"; parsed: ParsedQr; raw: string }
  | { kind: "error"; message: string; raw?: string };

// Large phone photos slow jsQR down a lot without improving detection.
const MAX_DIMENSION = 1600;

async function readQrFromImage(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return jsQR(data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

function decodeContent(raw: string): Result {
  try {
    return { kind: "decoded", parsed: parseZatcaQr(raw), raw };
  } catch (err) {
    if (err instanceof ZatcaQrError) {
      return {
        kind: "error",
        message: `This QR code isn't a ZATCA invoice code (${err.message}).`,
        raw,
      };
    }
    throw err;
  }
}

function QrScanner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });

  const onFile = async (f: File) => {
    if (image) URL.revokeObjectURL(image);
    setImage(URL.createObjectURL(f));
    setResult({ kind: "scanning" });
    try {
      const raw = await readQrFromImage(f);
      setResult(
        raw === null
          ? {
              kind: "error",
              message:
                "No QR code found in this image. Try a sharper, well-lit photo with the whole code visible.",
            }
          : decodeContent(raw),
      );
    } catch {
      setResult({ kind: "error", message: "This file could not be read as an image." });
    }
  };

  const reset = () => {
    if (image) URL.revokeObjectURL(image);
    setImage(null);
    setPasted("");
    setResult({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR Scanner"
        subtitle="Decode the QR code printed on a Saudi e-invoice and check its contents."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-soft">
          <CardContent className="p-6 space-y-4">
            <div
              className="rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5"
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud className="mx-auto h-10 w-10 text-primary" />
              <div className="mt-3 text-sm font-medium">Upload a photo or image of the QR code</div>
              <div className="text-xs text-muted-foreground">PNG, JPG or WebP</div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="qr-file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </div>
            {image && (
              <div className="grid place-items-center">
                <img src={image} alt="Uploaded QR" className="max-h-56 rounded-md border" />
              </div>
            )}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Or paste the QR text</div>
              <Textarea
                rows={3}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="AQxCb2JzIFJlY29yZHMC..."
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!pasted.trim()}
                onClick={() => setResult(decodeContent(pasted.trim()))}
              >
                Decode text
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              <div className="text-base font-semibold">Decoded content</div>
            </div>
            <ResultView result={result} onReset={reset} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResultView({ result, onReset }: { result: Result; onReset: () => void }) {
  if (result.kind === "idle") {
    return (
      <div className="grid place-items-center rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Upload an image or paste the QR text to see the seller and invoice details.
      </div>
    );
  }
  if (result.kind === "scanning") {
    return <div className="text-sm text-muted-foreground">Reading QR code…</div>;
  }
  if (result.kind === "error") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-sm text-destructive" data-testid="qr-error">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{result.message}</span>
        </div>
        {result.raw && (
          <div className="rounded-md bg-muted p-3 text-xs break-all">
            <div className="mb-1 text-muted-foreground">Raw content</div>
            {result.raw}
          </div>
        )}
        <Button variant="outline" onClick={onReset}>
          Scan another
        </Button>
      </div>
    );
  }

  const { parsed } = result;
  const vat = parsed.fields.vatNumber;
  const vatOk = vat ? isValidSaudiVatNumber(vat) : false;
  const complete = parsed.missingPhase1Tags.length === 0;

  return (
    <div className="space-y-3" data-testid="qr-decoded">
      {complete ? (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> ZATCA QR decoded
        </div>
      ) : (
        <div className="flex items-start gap-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          Missing required fields:{" "}
          {parsed.missingPhase1Tags.map((t) => QR_TAG_LABELS[t]).join(", ")}
        </div>
      )}
      <dl className="divide-y rounded-md border">
        {parsed.tags.map((t) => (
          <div key={t.tag} className="grid grid-cols-[10rem_1fr] gap-2 px-3 py-2 text-sm">
            <dt className="text-muted-foreground">{QR_TAG_LABELS[t.tag] ?? `Tag ${t.tag}`}</dt>
            <dd className="break-all font-medium">{t.value}</dd>
          </div>
        ))}
      </dl>
      {vat && !vatOk && (
        <div className="flex items-start gap-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          The seller VAT number should be 15 digits starting and ending with 3.
        </div>
      )}
      {parsed.hasPhase2Tags && (
        <p className="text-xs text-muted-foreground">
          This code includes Phase 2 security fields (hash and signature). They are shown but not
          cryptographically verified.
        </p>
      )}
      <Button variant="outline" onClick={onReset}>
        Scan another
      </Button>
    </div>
  );
}
