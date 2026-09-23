import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useStore, formatMoney, computeTotals, deleteInvoice } from "@/lib/store";
import { Plus, Search, MoreHorizontal, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoices · AI Invoice Saudi" },
      { name: "description", content: "Search and manage your invoices." },
    ],
  }),
  component: Invoices,
});

const statusColors: Record<string, string> = {
  paid: "bg-success/15 text-success border-success/30",
  unpaid: "bg-warning/20 text-warning-foreground border-warning/40",
  draft: "bg-muted text-muted-foreground border-border",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
};

function Invoices() {
  const invoices = useStore((s) => s.invoices);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"date" | "amount" | "number">("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const per = 6;

  const filtered = useMemo(() => {
    let list = invoices.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (q === "" || `${i.number} ${i.customerName}`.toLowerCase().includes(q.toLowerCase())),
    );
    list = list.sort((a, b) => {
      let x = 0;
      if (sort === "date") x = a.date.localeCompare(b.date);
      else if (sort === "number") x = a.number.localeCompare(b.number);
      else x = computeTotals(a.items).total - computeTotals(b.items).total;
      return dir === "asc" ? x : -x;
    });
    return list;
  }, [invoices, q, status, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / per));
  const pageItems = filtered.slice((page - 1) * per, page * per);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} invoices in workspace`}
        actions={
          <Button onClick={() => navigate({ to: "/invoices/new" })}>
            <Plus className="mr-1 h-4 w-4" /> New invoice
          </Button>
        }
      />

      <Card className="shadow-soft">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search invoice number or customer…"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {["all", "draft", "paid", "unpaid", "overdue"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "All statuses" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Sort: date</SelectItem>
                <SelectItem value="number">Sort: number</SelectItem>
                <SelectItem value="amount">Sort: amount</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No invoices match your filters.
                  </TableCell>
                </TableRow>
              )}
              {pageItems.map((i) => {
                const t = computeTotals(i.items);
                return (
                  <TableRow
                    key={i.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/invoices/$id", params: { id: i.id } })}
                  >
                    <TableCell className="font-medium">{i.number}</TableCell>
                    <TableCell>{i.customerName}</TableCell>
                    <TableCell>{i.date}</TableCell>
                    <TableCell>{i.dueDate}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[i.status]}>
                        {i.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatMoney(t.total, i.currency)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => navigate({ to: "/invoices/$id", params: { id: i.id } })}
                          >
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard?.writeText(i.number);
                              toast.success("Number copied");
                            }}
                          >
                            Copy number
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-destructive"
                              >
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete invoice {i.number}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    deleteInvoice(i.id);
                                    toast.success("Invoice deleted");
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t p-3 text-sm">
          <div className="text-muted-foreground">
            Page {page} of {pageCount}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
