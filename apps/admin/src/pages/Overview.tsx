import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { PilotSummary } from "../lib/types";
import StatusBadge from "../components/StatusBadge";

function isExpiringSoon(pilot: PilotSummary, thresholdHours = 48): boolean {
  if (!pilot.expiresAt) return false;
  if (!["active", "extended", "extension_pending"].includes(pilot.status)) return false;
  const hoursLeft = (new Date(pilot.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursLeft > 0 && hoursLeft <= thresholdHours;
}

export default function Overview() {
  const [pilots, setPilots] = useState<PilotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PilotSummary[]>("/pilots")
      .then(setPilots)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!pilots) return <p className="text-slate-400">Loading…</p>;

  const active = pilots.filter((p) => ["active", "extended", "extension_pending"].includes(p.status));
  const expiringSoon = pilots.filter(isExpiringSoon);
  const failedProvisioning = pilots.filter((p) => p.status === "failed_provisioning");
  const suspended = pilots.filter((p) => p.status === "suspended");
  const conversionReview = pilots.filter((p) => p.status === "conversion_review");
  const recent = [...pilots].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8);

  const tiles: { label: string; count: number; tone: string }[] = [
    { label: "Active trials", count: active.length, tone: "text-emerald-400" },
    { label: "Expiring soon (48h)", count: expiringSoon.length, tone: "text-amber-400" },
    { label: "Provisioning failures", count: failedProvisioning.length, tone: "text-red-400" },
    { label: "Suspended", count: suspended.length, tone: "text-yellow-400" },
    { label: "Conversion review", count: conversionReview.length, tone: "text-fuchsia-400" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-slate-400">System health, active trials, and what needs attention.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className={`text-2xl font-semibold ${tile.tone}`}>{tile.count}</div>
            <div className="text-xs text-slate-400">{tile.label}</div>
          </div>
        ))}
      </div>

      {expiringSoon.length > 0 && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-300">Expiring within 48 hours</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {expiringSoon.map((p) => (
              <li key={p.id}>
                <Link to={`/pilots/${p.id}`} className="text-amber-200 underline hover:text-amber-100">
                  {p.name}
                </Link>{" "}
                <span className="text-slate-400">— {p.pilotOrg.name} · expires {new Date(p.expiresAt!).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Recent pilots</h2>
          <Link to="/pilots" className="text-sm text-indigo-400 hover:text-indigo-300">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-left text-slate-400">
              <tr>
                <th className="px-3 py-2">Pilot</th>
                <th className="px-3 py-2">Organization</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="border-t border-slate-800 hover:bg-slate-900">
                  <td className="px-3 py-2">
                    <Link to={`/pilots/${p.id}`} className="text-indigo-400 hover:text-indigo-300">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{p.pilotOrg.name}</td>
                  <td className="px-3 py-2 text-slate-300">{p.product.name}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2 text-slate-400">{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    No pilots yet. <Link to="/pilots/new" className="text-indigo-400">Create one</Link>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
