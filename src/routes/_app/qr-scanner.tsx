import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrPreview } from "@/components/QrPreview";
import { QrCode, UploadCloud, CheckCircle2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/qr-scanner")({
  head: () => ({ meta: [{ title: "QR Scanner · AI Invoice Saudi" }, { name: "description", content: "Scan and decode ZATCA-style invoice QR codes." }] }),
  component: QrScanner,
});

function QrScanner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [decoded, setDecoded] = useState<null | { seller: string; vat: string; date: string; total: string; vatAmount: string; success: boolean }>(null);
  const [image, setImage] = useState<string | null>(null);

  const onFile = (f: File) => {
    const url = URL.createObjectURL(f);
    setImage(url);
    setTimeout(() => {
      setDecoded({
        seller: "Nawa Technologies LLC",
        vat: "300777888900003",
        date: "2025-11-18T10:24:00",
        total: "SAR 12,650.00",
        vatAmount: "SAR 1,650.00",
        success: true,
      });
      toast.success("QR decoded successfully");
    }, 900);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="QR Scanner" subtitle="Upload a QR image to decode the ZATCA invoice payload." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-soft">
          <CardContent className="p-6 space-y-4">
            <div className="rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5" onClick={() => inputRef.current?.click()}>
              <UploadCloud className="mx-auto h-10 w-10 text-primary" />
              <div className="mt-3 text-sm font-medium">Upload a QR image</div>
              <div className="text-xs text-muted-foreground">PNG or JPG</div>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </div>
            {image ? (
              <div className="grid place-items-center">
                <img src={image} alt="Uploaded QR" className="max-h-56 rounded-md border" />
              </div>
            ) : (
              <div className="grid place-items-center">
                <QrPreview value="demo:preview" size={180} />
                <p className="mt-2 text-xs text-muted-foreground">Sample QR shown for reference</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              <div className="text-base font-semibold">Decoded payload</div>
            </div>
            {decoded ? (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Decoding succeeded
                </div>
                <dl className="divide-y">
                  {[
                    ["Seller name", decoded.seller],
                    ["VAT number", decoded.vat],
                    ["Invoice date", decoded.date],
                    ["Invoice total", decoded.total],
                    ["VAT amount", decoded.vatAmount],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-2 gap-2 py-2 text-sm">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <Button variant="outline" onClick={() => { setDecoded(null); setImage(null); }}>Scan another</Button>
              </div>
            ) : (
              <div className="grid place-items-center rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                Upload a QR image to view decoded seller and invoice details.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
