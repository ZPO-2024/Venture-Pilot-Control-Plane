import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { PilotSummary } from "../lib/types";
import StatusBadge from "../components/StatusBadge";

export default function PilotList() {
  const [pilots, setPilots] = useState<PilotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api
      .get<PilotSummary[]>("/pilots")
      .then(setPilots)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!pilots) return <p className="text-slate-400">Loading…</p>;

  const filtered = pilots.filter(
    (p) =>
      !filter ||
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.pilotOrg.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.product.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pilots</h1>
        <Link to="/pilots/new" className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
          + New pilot
        </Link>
      </div>
      <input
        className="w-full max-w-sm rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
        placeholder="Filter by pilot, org, or product…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-400">
            <tr>
              <th className="px-3 py-2">Pilot</th>
              <th className="px-3 py-2">Organization</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Participants</th>
              <th className="px-3 py-2">Expires</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-slate-800 hover:bg-slate-900">
                <td className="px-3 py-2">
                  <Link to={`/pilots/${p.id}`} className="text-indigo-400 hover:text-indigo-300">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-300">{p.pilotOrg.name}</td>
                <td className="px-3 py-2 text-slate-300">{p.product.name}</td>
                <td className="px-3 py-2 text-slate-400">{p.productVersion.version}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-3 py-2 text-slate-400">{p.participants.length}</td>
                <td className="px-3 py-2 text-slate-400">{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No pilots match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
