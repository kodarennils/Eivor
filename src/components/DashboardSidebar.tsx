"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { BuildingIcon, LogOutIcon } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Ärenden" },
  { href: "/detaljplaner", label: "Mina detaljplaner" },
  { href: "/hjalp", label: "Hjälp" },
  { href: "/betalning", label: "Betalning" },
  { href: "/installningar", label: "Kontoinställningar" },
];

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-xl bg-accent text-accent-foreground">
        <BuildingIcon className="size-4" />
      </span>
      <span className="text-lg font-semibold">Eivor</span>
    </span>
  );
}

export function getDisplayName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  return (meta?.full_name as string) || (meta?.name as string) || user.email || "Användare";
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function DashboardSidebar({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const pathname = usePathname();
  const displayName = getDisplayName(user);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-background px-4 py-5">
      <Link href="/dashboard" className="px-2">
        <Wordmark />
      </Link>

      <nav className="mt-8 flex flex-col gap-1">
        <p className="px-2 text-xs font-semibold tracking-wide text-foreground/40 uppercase">
          Mina ärenden
        </p>
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
                active ? "bg-accent-soft text-accent" : "text-foreground/70 hover:bg-muted"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-3 border-t border-border pt-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {getInitials(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-foreground/50">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          aria-label="Logga ut"
          className="shrink-0 text-foreground/40 hover:text-foreground/70"
        >
          <LogOutIcon className="size-4" />
        </button>
      </div>
    </aside>
  );
}
