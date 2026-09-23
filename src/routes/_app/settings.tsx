import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserSettings } from "@/lib/invoice-math";
import { settingsQuery } from "@/lib/queries";
import { updateSettings } from "@/server/profile";
import { updatePassword } from "@/server/auth";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(settingsQuery()),
  head: () => ({
    meta: [
      { title: "Settings · AI Invoice Saudi" },
      { name: "description", content: "Account and workspace settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [fullName, setFullName] = useState(settings.fullName);

  const patch = useMutation({
    mutationFn: (data: Partial<Omit<UserSettings, "email">>) => updateSettings({ data }),
    onSuccess: async (saved, vars) => {
      queryClient.setQueryData(settingsQuery().queryKey, saved);
      if (vars.fullName !== undefined) await router.invalidate(); // header shows the name
      toast.success("Settings saved");
    },
    onError: () => toast.error("Could not save settings"),
  });

  const changePw = async () => {
    if (pw.next.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw.next !== pw.confirm) return toast.error("Passwords do not match");
    const res = await updatePassword({ data: { password: pw.next } });
    if (!res.ok) return toast.error(res.error);
    setPw({ next: "", confirm: "" });
    toast.success("Password updated");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Personalize your AI Invoice workspace" />

      <Tabs defaultValue="preferences">
        <TabsList>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="preferences" className="mt-4">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Language & theme</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select
                  value={settings.language}
                  onValueChange={(v) => patch.mutate({ language: v as UserSettings["language"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">العربية (Arabic)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Theme</Label>
                <Select
                  value={settings.theme}
                  onValueChange={(v) => patch.mutate({ theme: v as UserSettings["theme"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Notification preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Row
                label="Email notifications"
                desc="Receive invoice updates and payment reminders"
                checked={settings.emailNotifs}
                onChange={(v) => patch.mutate({ emailNotifs: v })}
              />
              <Row
                label="SMS notifications"
                desc="Text alerts for overdue invoices"
                checked={settings.smsNotifs}
                onChange={(v) => patch.mutate({ smsNotifs: v })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4 space-y-6">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Change password</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>New password</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={pw.next}
                  onChange={(e) => setPw({ ...pw, next: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={pw.confirm}
                  onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={changePw}>Update password</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={settings.email} disabled />
              </div>
              <div className="sm:col-span-2">
                <Button
                  onClick={() => {
                    if (!fullName.trim()) return toast.error("Name is required");
                    patch.mutate({ fullName: fullName.trim() });
                  }}
                  disabled={patch.isPending}
                >
                  Save profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
