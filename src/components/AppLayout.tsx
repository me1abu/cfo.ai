import {
  Link,
  Outlet,
  useRouter,
  useLocation,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  UploadCloud,
  ShieldCheck,
  QrCode,
  Users,
  Building2,
  BarChart3,
  Settings as SettingsIcon,
  LifeBuoy,
  LogOut,
  Menu,
  Bell,
  Search,
  Bot,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { signOut } from "@/server/auth";
import { askAssistant } from "@/server/ai";
import { settingsQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/upload", label: "AI Upload", icon: UploadCloud },
  { to: "/validation", label: "Invoice Validation", icon: ShieldCheck },
  { to: "/qr-scanner", label: "QR Scanner", icon: QrCode },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/company", label: "Company Profile", icon: Building2 },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
  { to: "/help", label: "Help", icon: LifeBuoy },
] as const;

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-1">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight">AI Invoice</div>
        <div className="text-[11px] text-muted-foreground">Saudi Arabia · ZATCA-ready</div>
      </div>
    </Link>
  );
}

function useLogout() {
  const navigate = useNavigate();
  const router = useRouter();
  return async () => {
    await signOut();
    await router.invalidate();
    toast.success("Signed out");
    navigate({ to: "/login" });
  };
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const logout = useLogout();
  return (
    <nav className="flex h-full flex-col gap-1 px-3 py-4">
      <div className="mb-4">
        <Brand />
      </div>
      {nav.map((n) => {
        const Icon = n.icon;
        const active =
          location.pathname === n.to ||
          (n.to !== "/dashboard" && location.pathname.startsWith(n.to));
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
            )}
          >
            <Icon className={cn("h-4 w-4", active && "text-primary")} />
            <span>{n.label}</span>
          </Link>
        );
      })}
      <div className="mt-auto pt-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </nav>
  );
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi! Ask me about your invoices, customers, revenue or VAT. For example: which invoices are overdue, or how much VAT you collected this month. I can look things up but can't change anything.";

const SUGGESTIONS = [
  "Which invoices are unpaid or overdue?",
  "How much VAT did I collect this month?",
  "Who are my biggest customers?",
  "Do any of my invoices have validation problems?",
];

function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The greeting is shown but never sent: the conversation sent to the server starts with the user.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, error]);

  const send = async (t?: string) => {
    const text = (t ?? input).trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text.slice(0, 4000) }];
    setMessages(next);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      // The server accepts the last 20 turns; it must start with a user turn.
      let history = next.slice(-20);
      while (history.length && history[0].role !== "user") history = history.slice(1);
      const res = await askAssistant({ data: { messages: history } });
      if (res.ok) setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      else setError(res.error);
    } catch {
      setError("Couldn't reach the assistant. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card shadow-2xl"
      data-testid="assistant-panel"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">AI Assistant</div>
            <div className="text-xs text-muted-foreground">Answers from your own data</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              disabled={busy}
            >
              New chat
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm">{GREETING}</div>
        {messages.map((m, i) => (
          <div
            key={i}
            dir="auto"
            data-role={m.role}
            className={cn(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
              m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="max-w-[85%] animate-pulse rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
            Looking that up…
          </div>
        )}
        {error && (
          <div
            className="max-w-[85%] rounded-2xl border border-destructive/40 px-3 py-2 text-sm text-destructive"
            data-testid="assistant-error"
          >
            {error}
          </div>
        )}
      </div>
      <div className="border-t p-3">
        {messages.length === 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                disabled={busy}
                className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-accent"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={input}
            dir="auto"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask about your invoices…"
            maxLength={4000}
            disabled={busy}
            data-testid="assistant-input"
          />
          <Button onClick={() => send()} disabled={busy || !input.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user } = useRouteContext({ from: "/_app" });
  const router = useRouter();
  const logout = useLogout();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const { data: settings } = useQuery(settingsQuery());

  // Apply the saved theme and text direction to the document.
  useEffect(() => {
    if (!settings) return;
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    document.documentElement.dir = settings.language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = settings.language;
  }, [settings]);

  const initials =
    user.name
      .split(" ")
      .filter(Boolean)
      .map((x) => x[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || user.email[0].toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar lg:block">
        <SideNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SideNav />
            </SheetContent>
          </Sheet>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search invoices, customers…" className="pl-9" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssistantOpen(true)}
              className="gap-1.5"
            >
              <Bot className="h-4 w-4 text-primary" /> AI Assistant
            </Button>
            <Button variant="ghost" size="icon" onClick={() => toast("No new notifications")}>
              <Bell className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-accent">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium sm:inline">
                    {user.name || user.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.navigate({ to: "/settings" })}>
                  Profile settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.navigate({ to: "/company" })}>
                  Company profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
