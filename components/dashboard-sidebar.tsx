"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/plants", label: "Plants" },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link
          href="/dashboard"
          className="font-heading text-sm font-semibold tracking-tight"
        >
          Plantoria
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {nav.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <p className="truncate px-1 text-xs text-muted-foreground">Signed in</p>
        <p
          className="truncate px-1 text-sm font-medium"
          title={user?.email ?? ""}
        >
          {user?.email ?? "—"}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          size="sm"
          onClick={handleLogout}
        >
          Log out
        </Button>
      </div>
    </aside>
  );
}
