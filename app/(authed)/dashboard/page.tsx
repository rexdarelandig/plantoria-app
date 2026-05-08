"use client";

import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <main className="flex flex-1 flex-col gap-2 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Dashboard
      </h1>
      <p className="text-muted-foreground">
        You are signed in as{" "}
        <span className="font-medium text-foreground">{user?.email}</span>.
      </p>
    </main>
  );
}
