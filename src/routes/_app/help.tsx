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
                "Does AI Invoice comply with ZATCA Phase 2?",
                "Yes. AI Invoice generates invoices with the required structured fields and QR payload used by ZATCA Phase 2 e-invoicing. Consult your tax advisor for final integration steps with the FATOORA platform.",
              ],
              [
                "What file formats can I upload?",
                "PDF, JPG, PNG, DOCX and XLSX files up to 25 MB each.",
              ],
              [
                "Is my data stored in Saudi Arabia?",
                "Customer data is stored in KSA-region data centers with encryption at rest and in transit.",
              ],
              [
                "How is VAT calculated?",
                "The default VAT rate is 15%. VAT is applied per line item after any discount, and totals are aggregated with proper rounding to two decimals.",
              ],
              [
                "Can I generate bilingual (Arabic/English) invoices?",
                "Yes — pick the Arabic-English template inside the invoice editor.",
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
