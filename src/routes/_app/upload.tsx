import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  UploadCloud,
  FileText,
  ImageIcon,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { companyQuery, invoicesQuery } from "@/lib/queries";
import { nextInvoiceNumber } from "@/lib/invoice-math";
import { saveInvoice } from "@/server/invoices";

export const Route = createFileRoute("/_app/upload")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(companyQuery()),
      queryClient.ensureQueryData(invoicesQuery()),
    ]),
  head: () => ({
    meta: [
      { title: "AI Upload · AI Invoice Saudi" },
      { name: "description", content: "Upload documents and extract invoice data with AI." },
    ],
  }),
  component: UploadPage,
});

const stages = [
  { label: "Uploading…", ms: 700 },
  { label: "Reading document…", ms: 900 },
  { label: "AI extracting invoice information…", ms: 1400 },
  { label: "Extraction complete.", ms: 400 },
];

function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [extracted, setExtracted] = useState<null | {
    number: string;
    date: string;
    dueDate: string;
    customerName: string;
    customerVat: string;
    customerAddress: string;
    items: { description: string; quantity: number; unitPrice: number }[];
  }>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const { data: company } = useSuspenseQuery(companyQuery());
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleFile = (f: File) => {
    setFile(f);
    setExtracted(null);
    setStage(0);
    setProgress(5);
    let elapsed = 0;
    stages.forEach((st, idx) => {
      elapsed += st.ms;
      setTimeout(() => {
        setStage(idx);
        setProgress(Math.round(((idx + 1) / stages.length) * 100));
        if (idx === stages.length - 1) {
          setExtracted({
            number: `INV-AI-${Math.floor(Math.random() * 9000 + 1000)}`,
            date: new Date().toISOString().slice(0, 10),
            dueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
            customerName: "Al Rajhi Trading Co.",
            customerVat: "300123456700003",
            customerAddress: "King Fahd Rd, Riyadh 12345",
            items: [
              { description: "Consulting services", quantity: 20, unitPrice: 450 },
              { description: "Software license", quantity: 1, unitPrice: 8500 },
            ],
          });
        }
      }, elapsed);
    });
  };

  const create = useMutation({
    mutationFn: () =>
      saveInvoice({
        data: {
          number: extracted!.number || nextInvoiceNumber(invoices),
          date: extracted!.date,
          dueDate: extracted!.dueDate,
          customerId: null,
          customerName: extracted!.customerName,
          customerVat: extracted!.customerVat,
          customerAddress: extracted!.customerAddress,
          currency: company.currency,
          items: extracted!.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: 0,
            vatRate: company.vatRate,
          })),
          status: "draft",
          template: "bilingual",
          notes: "",
        },
      }),
    onSuccess: async (res) => {
      if (!res.ok) return toast.error(res.error);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Draft invoice created from document");
      navigate({ to: "/invoices/$id", params: { id: res.id } });
    },
    onError: () => toast.error("Could not create the draft"),
  });
  const createFromExtracted = () => {
    if (!extracted) return;
    create.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Upload"
        subtitle="Upload PDF, image, Word or Excel documents. Our AI extracts invoice fields for review."
      />

      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div
            ref={dragRef}
            onDragOver={(e) => {
              e.preventDefault();
              dragRef.current?.classList.add("border-primary", "bg-primary/5");
            }}
            onDragLeave={() => dragRef.current?.classList.remove("border-primary", "bg-primary/5")}
            onDrop={(e) => {
              e.preventDefault();
              dragRef.current?.classList.remove("border-primary", "bg-primary/5");
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className="grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="mt-4 text-base font-medium">
              Drag & drop a document, or click to browse
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Supports PDF, JPG, PNG, DOCX, XLSX · up to 25 MB
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
                <FileText className="h-3.5 w-3.5" /> PDF
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
                <ImageIcon className="h-3.5 w-3.5" /> Image
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
                <FileText className="h-3.5 w-3.5" /> Word
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {file && (
        <Card className="shadow-soft">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
            </div>
            <Progress value={progress} />
            <ul className="space-y-1 text-sm">
              {stages.map((st, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-2 ${i <= stage ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {i < stage || (i === stages.length - 1 && stage === i) ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : i === stage ? (
                    <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
                  ) : (
                    <div className="h-3 w-3 rounded-full border" />
                  )}
                  {st.label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {extracted && (
        <Card className="shadow-soft">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Extracted information</div>
                <div className="text-xs text-muted-foreground">
                  Review the fields, then create an editable draft.
                </div>
              </div>
              <Button onClick={createFromExtracted}>
                Open in editor <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Invoice number"
                value={extracted.number}
                onChange={(v) => setExtracted({ ...extracted, number: v })}
              />
              <Field
                label="Customer"
                value={extracted.customerName}
                onChange={(v) => setExtracted({ ...extracted, customerName: v })}
              />
              <Field
                label="Invoice date"
                value={extracted.date}
                onChange={(v) => setExtracted({ ...extracted, date: v })}
                type="date"
              />
              <Field
                label="Due date"
                value={extracted.dueDate}
                onChange={(v) => setExtracted({ ...extracted, dueDate: v })}
                type="date"
              />
              <Field
                label="VAT number"
                value={extracted.customerVat}
                onChange={(v) => setExtracted({ ...extracted, customerVat: v })}
              />
              <Field
                label="Address"
                value={extracted.customerAddress}
                onChange={(v) => setExtracted({ ...extracted, customerAddress: v })}
              />
            </div>
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2">Qty</th>
                    <th className="p-2 text-right">Unit price</th>
                  </tr>
                </thead>
                <tbody>
                  {extracted.items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{it.description}</td>
                      <td className="p-2 text-center">{it.quantity}</td>
                      <td className="p-2 text-right">{it.unitPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
