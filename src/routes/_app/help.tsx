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
                "Not yet. AI Invoice supports ZATCA Phase 1 (generation): tax invoices with the required fields in Arabic and English, validation against ZATCA's published rules, and the Phase 1 QR code. Phase 2 (integration with the FATOORA platform: XML invoices, cryptographic stamps and reporting or clearance with ZATCA) is not supported yet. Check with ZATCA or your tax advisor whether your business is already required to integrate.",
              ],
              [
                "Can I upload documents?",
                "Reading invoice data from uploaded documents with AI is in development and not available yet. The QR scanner already reads PNG, JPG and WebP images.",
              ],
              [
                "Where is my data stored?",
                "Data is stored with our database provider, Supabase, in its Singapore region (AWS ap-southeast-1), and is encrypted in transit.",
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
