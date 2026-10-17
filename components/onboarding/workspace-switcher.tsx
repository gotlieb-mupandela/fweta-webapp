"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronsUpDown } from "lucide-react";

import { switchWorkspaceAction } from "@/app/actions/workspaces";
import { cn } from "@/lib/utils";

export type WorkspaceOption = {
  id: string;
  name: string;
  role: string;
};

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  compact = false,
  id = "workspace-switcher",
}: {
  workspaces: WorkspaceOption[];
  activeId: string | null;
  compact?: boolean;
  id?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (workspaces.length === 0) return null;

  return (
    <div className={compact ? "w-full" : "w-full"}>
      <label className="sr-only" htmlFor={id}>
        Switch brand
      </label>
      <div className="relative">
        <select
          id={id}
          value={activeId ?? workspaces[0]?.id}
          disabled={pending || workspaces.length < 2}
          onChange={(event) => {
            const next = event.target.value;
            if (!next || next === activeId) return;
            startTransition(async () => {
              const res = await switchWorkspaceAction(next);
              if (!res.ok) return;
              router.refresh();
            });
          }}
          className={cn(
            "w-full appearance-none border border-border bg-white font-medium text-foreground outline-none transition",
            "hover:border-foreground/20 focus:border-foreground focus:ring-2 focus:ring-gold/25",
            "disabled:opacity-80",
            compact ? "h-10 rounded-xl pl-3 pr-9 text-xs" : "mt-2 h-11 rounded-2xl pl-3.5 pr-10 text-sm",
          )}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name} ({workspace.role})
            </option>
          ))}
        </select>
        <ChevronsUpDown
          className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted"
          aria-hidden
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{pending ? "Switching brand..." : "Brand workspace"}</p>
    </div>
  );
}
