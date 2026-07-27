import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { PilotDetail as PilotDetailType, AuditEventView, UsageEventView, HealthEventView } from "../lib/types";
import StatusBadge from "../components/StatusBadge";

type Tab = "overview" | "activity" | "feedback" | "audit";

function ReasonAction({ label, tone, onSubmit }: { label: string; tone: string; onSubmit: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`rounded px-3 py-1.5 text-sm text-white ${tone}`}>
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-slate-700 bg-slate-950 p-2">
      <input
        autoFocus
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
        placeholder="Reason (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={!reason || busy}
          className={`rounded px-2 py-1 text-xs text-white ${tone} disabled:opacity-50`}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSubmit(reason);
              setOpen(false);
              setReason("");
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm {label}
        </button>
        <button className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300" onClick={() => { setOpen(false); setError(null); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PilotDetail() {
  const { id } = useParams<{ id: string }>();
  const [pilot, setPilot] = useState<PilotDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [audit, setAudit] = useState<AuditEventView[] | null>(null);
  const [usage, setUsage] = useState<{ usageEvents: UsageEventView[]; healthEvents: HealthEventView[] } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<PilotDetailType>(`/pilots/${id}`)
      .then(setPilot)
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (tab === "audit" && id) api.get<AuditEventView[]>(`/pilots/${id}/audit`).then(setAudit);
    if (tab === "activity" && id) api.get<{ usageEvents: UsageEventView[]; healthEvents: HealthEventView[] }>(`/pilots/${id}/usage`).then(setUsage);
  }, [tab, id]);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!pilot) return <p className="text-slate-400">Loading…</p>;

  async function act(path: string, body: Record<string, unknown>, message: string) {
    setActionError(null);
    await api.post(`/pilots/${id}${path}`, body);
    setActionMessage(message);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{pilot.name}</h1>
          <p className="text-sm text-slate-400">
            {pilot.pilotOrg.name} · {pilot.product.name} v{pilot.productVersion.version}
          </p>
        </div>
        <StatusBadge status={pilot.status} />
      </div>

      {actionMessage && <p className="rounded border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">{actionMessage}</p>}
      {actionError && <p className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">{actionError}</p>}

      <div className="flex flex-wrap gap-2">
        <ReasonAction label="Extend +7d" tone="bg-emerald-700 hover:bg-emerald-600" onSubmit={(reason) => act("/extend", { additionalDays: 7, reason }, "Pilot extended.")} />
        <ReasonAction label="Suspend" tone="bg-yellow-700 hover:bg-yellow-600" onSubmit={(reason) => act("/suspend", { reason }, "Pilot suspended.")} />
        <ReasonAction label="Revoke" tone="bg-red-700 hover:bg-red-600" onSubmit={(reason) => act("/revoke", { reason }, "Pilot revoked; all sessions ended.")} />
        <ReasonAction label="Reset environment" tone="bg-slate-700 hover:bg-slate-600" onSubmit={(reason) => act("/reset", { reason }, "Environment reset.")} />
        <button
          className="rounded bg-sky-700 px-3 py-1.5 text-sm text-white hover:bg-sky-600"
          onClick={async () => {
            try {
              const res = await api.post<{ storageRef: string }>(`/pilots/${id}/export`, {});
              setActionMessage(`Export complete: ${res.storageRef}`);
              load();
            } catch (err) {
              setActionMessage(null);
              setActionError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Export
        </button>
        <ReasonAction label="Destroy" tone="bg-red-900 hover:bg-red-800" onSubmit={(reason) => act("/destroy", { reason }, "Destruction executed.")} />
        <button
          className="rounded bg-fuchsia-700 px-3 py-1.5 text-sm text-white hover:bg-fuchsia-600"
          onClick={async () => {
            try {
              await api.post(`/pilots/${id}/conversion`, {});
              setActionError(null);
              setActionMessage("Conversion packet generated.");
              load();
            } catch (err) {
              setActionMessage(null);
              setActionError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Generate conversion packet
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-800 text-sm">
        {(["overview", "activity", "feedback", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 capitalize ${tab === t ? "border-b-2 border-indigo-500 text-indigo-400" : "text-slate-400 hover:text-slate-200"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Pilot</h2>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-500">Organization</dt>
              <dd>{pilot.pilotOrg.name}</dd>
              <dt className="text-slate-500">Created</dt>
              <dd>{new Date(pilot.createdAt).toLocaleString()}</dd>
              <dt className="text-slate-500">Expires</dt>
              <dd>{pilot.expiresAt ? new Date(pilot.expiresAt).toLocaleString() : "—"}</dd>
              <dt className="text-slate-500">Environment</dt>
              <dd>{pilot.environment ? <StatusBadge status={pilot.environment.status} /> : "—"}</dd>
              <dt className="text-slate-500">Dataset version</dt>
              <dd>{pilot.environment?.currentDatasetVersion?.version ?? "—"}</dd>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Participants &amp; grants</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {pilot.participants.map((p) => {
                const grant = pilot.accessGrants.find((g) => g.participantId === p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between rounded bg-slate-950 px-2 py-1">
                    <span>
                      {p.email} <span className="text-xs text-slate-500">({p.role})</span>
                    </span>
                    {grant ? <StatusBadge status={grant.status} /> : <span className="text-xs text-slate-500">not invited</span>}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Feature entitlements</h2>
            <ul className="flex flex-wrap gap-1">
              {pilot.entitlements.map((e) => (
                <li key={e.id} className={`rounded px-2 py-0.5 text-xs ${e.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>
                  {e.productFeature.key}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Provisioning history</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {pilot.provisioningRuns.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded bg-slate-950 px-2 py-1">
                  <span>
                    {r.kind} <span className="text-xs text-slate-500">{new Date(r.startedAt).toLocaleString()}</span>
                  </span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
              {pilot.provisioningRuns.length === 0 && <li className="text-xs text-slate-500">No runs yet.</li>}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 md:col-span-2">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Export / destruction state</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ul className="flex flex-col gap-1 text-sm">
                {pilot.exportRequests.map((e) => (
                  <li key={e.id} className="flex items-center justify-between rounded bg-slate-950 px-2 py-1">
                    <span className="text-xs text-slate-400">{new Date(e.requestedAt).toLocaleString()}</span>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
                {pilot.exportRequests.length === 0 && <li className="text-xs text-slate-500">No export requests.</li>}
              </ul>
              <ul className="flex flex-col gap-1 text-sm">
                {pilot.destructionRequests.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded bg-slate-950 px-2 py-1">
                    <span className="text-xs text-slate-400">{new Date(d.requestedAt).toLocaleString()}</span>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
                {pilot.destructionRequests.length === 0 && <li className="text-xs text-slate-500">No destruction requests.</li>}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 md:col-span-2">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Conversion packet</h2>
            {pilot.conversionRecord ? (
              <>
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <StatusBadge status={pilot.conversionRecord.status} />
                  <span className="text-xs text-slate-500">generated {new Date(pilot.conversionRecord.generatedAt).toLocaleString()}</span>
                </div>
                <pre className="max-h-64 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400">
                  {JSON.stringify(pilot.conversionRecord.packetJson, null, 2)}
                </pre>
              </>
            ) : (
              <p className="text-xs text-slate-500">No conversion packet generated yet.</p>
            )}
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Product usage</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {usage?.usageEvents.map((e) => (
                <li key={e.id} className="rounded bg-slate-950 px-2 py-1">
                  <span className="text-slate-200">{e.type.replace(/_/g, " ")}</span>{" "}
                  <span className="text-xs text-slate-500">{new Date(e.occurredAt).toLocaleString()}</span>
                </li>
              ))}
              {usage && usage.usageEvents.length === 0 && <li className="text-xs text-slate-500">No usage recorded yet.</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">System health</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {usage?.healthEvents.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded bg-slate-950 px-2 py-1">
                  <span className="text-xs text-slate-500">{new Date(e.occurredAt).toLocaleString()}</span>
                  <StatusBadge status={e.status} />
                </li>
              ))}
              {usage && usage.healthEvents.length === 0 && <li className="text-xs text-slate-500">No health checks recorded yet.</li>}
            </ul>
          </div>
          <p className="text-xs text-slate-500 md:col-span-2">
            Usage and health are shown separately by design — see docs/ARCHITECTURE.md.
          </p>
        </div>
      )}

      {tab === "feedback" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <ul className="flex flex-col gap-2 text-sm">
            {pilot.feedbackRecords.map((f) => (
              <li key={f.id} className="rounded bg-slate-950 p-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${f.category === "issue" ? "bg-red-500/20 text-red-300" : "bg-slate-800 text-slate-300"}`}>
                    {f.category}
                  </span>
                  {f.rating && <span className="text-xs text-amber-400">{"★".repeat(f.rating)}</span>}
                  <span className="text-xs text-slate-500">{new Date(f.createdAt).toLocaleString()}</span>
                </div>
                {f.subject && <div className="mt-1 font-medium text-slate-200">{f.subject}</div>}
                {f.comment && <div className="mt-1 text-slate-300">{f.comment}</div>}
              </li>
            ))}
            {pilot.feedbackRecords.length === 0 && <li className="text-xs text-slate-500">No feedback submitted yet.</li>}
          </ul>
        </div>
      )}

      {tab === "audit" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <ol className="flex flex-col gap-2 border-l border-slate-800 pl-4 text-sm">
            {audit?.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-500" />
                <div className="text-xs text-slate-500">{new Date(e.occurredAt).toLocaleString()}</div>
                <div className="text-slate-200">{e.summary}</div>
              </li>
            ))}
            {audit && audit.length === 0 && <li className="text-xs text-slate-500">No audit events yet.</li>}
          </ol>
        </div>
      )}
    </div>
  );
}
