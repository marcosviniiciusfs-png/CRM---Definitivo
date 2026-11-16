import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { COMMISSION_STATUS, isCommissionStatus } from "@/lib/consortiumCommission";

export function StatusBadge({ status }: { status: string }) {
  const info = isCommissionStatus(status) ? COMMISSION_STATUS[status] : { label: status, tone: "bg-secondary text-muted-foreground" };
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", info.tone)}>
      {info.label}
    </span>
  );
}

export function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 whitespace-nowrap text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground sm:text-[28px]">
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
