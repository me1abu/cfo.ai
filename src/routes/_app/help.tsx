import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Book, Mail, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_app/help")({
  head: () => ({
    meta: [
      { title: "Help · AI Invoice Saudi" },
      { name: "description", content: "Guides and support for AI Invoice." },
    ],
  }),
  component: Help,
});

function Help() {
  return (
    <div className="space-y-6">
      <PageHeader title="Help & Support" subtitle="Guides, FAQs, and contact channels" />

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Book,
            title: "Documentation",
            desc: "How to configure ZATCA fields, VAT groups, and templates.",
            cta: "Open docs",
          },
          {
            icon: MessageCircle,
            title: "Live chat",
            desc: "Chat with a specialist Sunday–Thursday, 9am–6pm AST.",
            cta: "Start chat",
          },
          {
            icon: Mail,
            title: "Email support",
            desc: "support@ai-invoice.sa · replies within 4 business hours.",
            cta: "Send email",
          },
        ].map((c) => (
          <Card key={c.title} className="shadow-soft">
            <CardContent className="p-6">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <c.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 text-base font-semibold">{c.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
              <Button variant="outline" className="mt-4" onClick={() => {}}>
                {c.cta}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">Frequently asked questions</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            {[
              [
                "Does AI Invoice support ZATCA e-invoicing?",
                "Yes. AI Invoice creates tax invoices in Arabic and English with the required fields and QR code (Phase 1). To connect to ZATCA's FATOORA platform (Phase 2), open ZATCA Connection and enter an OTP from your FATOORA portal: standard invoices are then cleared by ZATCA before you can share them, and simplified invoices are reported. Zero-rated or exempt lines and currencies other than SAR can't be sent to ZATCA yet. You remain responsible for your own compliance, so check with your tax advisor if you're unsure.",
              ],
              [
                "Can I upload documents?",
                "Yes. AI Upload reads a PDF or photo (up to 3 MB) into a draft invoice for you to review, and Invoice Validation checks invoices you received. AI can misread a document, so compare important values with the original. The QR scanner reads PNG, JPG and WebP images.",
              ],
              [
                "Where is my data stored?",
                "Data is stored with our database provider, Supabase, in its Singapore region (AWS ap-southeast-1), and is encrypted in transit. The app runs on Vercel in Singapore. Documents you upload and questions you ask the assistant are sent to Anthropic's Claude AI to be processed, and invoices you email are sent through Resend.",
              ],
              [
                "How is VAT calculated?",
                "The default VAT rate is 15%. VAT is calculated per line after any discount and rounded to the nearest halala, as ZATCA's tax invoicing guideline requires.",
              ],
              [
                "Can I generate bilingual (Arabic/English) invoices?",
                "Yes. New invoices use the Arabic-English template by default, and downloaded PDFs label every field in both languages. ZATCA requires tax invoices to be issued in Arabic.",
              ],
            ].map(([q, a], i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger className="text-left">{q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
