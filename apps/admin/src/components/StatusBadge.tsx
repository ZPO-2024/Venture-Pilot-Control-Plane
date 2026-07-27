const COLORS: Record<string, string> = {
  draft: "bg-slate-700 text-slate-200",
  provisioning: "bg-blue-500/20 text-blue-300",
  ready: "bg-cyan-500/20 text-cyan-300",
  invited: "bg-violet-500/20 text-violet-300",
  active: "bg-emerald-500/20 text-emerald-300",
  extension_pending: "bg-amber-500/20 text-amber-300",
  extended: "bg-emerald-500/20 text-emerald-300",
  conversion_review: "bg-fuchsia-500/20 text-fuchsia-300",
  converted: "bg-emerald-600/30 text-emerald-300",
  expired: "bg-orange-500/20 text-orange-300",
  suspended: "bg-yellow-500/20 text-yellow-300",
  revoked: "bg-red-500/20 text-red-300",
  declined: "bg-slate-700 text-slate-300",
  failed_provisioning: "bg-red-500/20 text-red-300",
  exported: "bg-sky-500/20 text-sky-300",
  destroyed: "bg-slate-800 text-slate-400",
  succeeded: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-red-500/20 text-red-300",
  running: "bg-blue-500/20 text-blue-300",
  pending: "bg-slate-700 text-slate-200",
  healthy: "bg-emerald-500/20 text-emerald-300",
  degraded: "bg-amber-500/20 text-amber-300",
  down: "bg-red-500/20 text-red-300",
  unknown: "bg-slate-700 text-slate-300",
  blocked: "bg-red-500/20 text-red-300",
  scheduled: "bg-blue-500/20 text-blue-300",
  executed: "bg-emerald-500/20 text-emerald-300",
  delivered: "bg-emerald-500/20 text-emerald-300",
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? "bg-slate-700 text-slate-200";
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{status.replace(/_/g, " ")}</span>;
}
