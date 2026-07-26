import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("ai-invoice-sa-v1");
      const hasUser = raw && JSON.parse(raw)?.auth?.user;
      throw redirect({ to: hasUser ? "/dashboard" : "/login" });
    }
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
