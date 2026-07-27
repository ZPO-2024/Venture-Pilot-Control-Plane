import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Product, PilotRole } from "../lib/types";

interface ParticipantRow {
  email: string;
  displayName: string;
  role: PilotRole;
}

interface IssuedInvitation {
  email: string;
  rawToken: string;
  expiresAt: string;
}

const STEPS = ["Product", "Version", "Customer", "Template & duration", "Roles & features", "Provision & invite"];

export default function PilotWizard() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [step, setStep] = useState(0);

  const [productId, setProductId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [orgContactName, setOrgContactName] = useState("");
  const [pilotName, setPilotName] = useState("");
  const [templateKey, setTemplateKey] = useState("default-demo");
  const [durationDays, setDurationDays] = useState(7);
  const [environmentTypeKey, setEnvironmentTypeKey] = useState("sandbox");
  const [featureKeys, setFeatureKeys] = useState<string[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([{ email: "", displayName: "", role: "evaluator" }]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPilotId, setCreatedPilotId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [provisionResult, setProvisionResult] = useState<unknown>(null);
  const [invitations, setInvitations] = useState<IssuedInvitation[]>([]);

  useEffect(() => {
    api.get<Product[]>("/products").then(setProducts).catch((e) => setError(String(e)));
  }, []);

  const product = products.find((p) => p.id === productId);
  const version = product?.versions.find((v) => v.id === versionId);

  async function runFullSubmit() {
    if (!product || !version) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<{ id: string; participants: { id: string; email: string }[] }>("/pilots", {
        productKey: product.key,
        productVersion: version.version,
        templateKey,
        organization: { name: orgName, primaryContactEmail: orgEmail, primaryContactName: orgContactName || undefined },
        name: pilotName || `${orgName} — ${product.name} pilot`,
        durationDays,
        environmentTypeKey,
        featureKeys,
        participants: participants.filter((p) => p.email).map((p) => ({ email: p.email, displayName: p.displayName || undefined, role: p.role })),
      });
      setCreatedPilotId(created.id);

      const provision = await api.post(`/pilots/${created.id}/provision`, {});
      setProvisionResult(provision);

      const issued: IssuedInvitation[] = [];
      for (const participant of created.participants) {
        const invite = await api.post<{ rawToken: string; expiresAt: string }>(`/pilots/${created.id}/invitations`, {
          participantId: participant.id,
          expiresInHours: durationDays * 24,
        });
        issued.push({ email: participant.email, rawToken: invite.rawToken, expiresAt: invite.expiresAt });
      }
      setInvitations(issued);
      setDone(true);
      setStep(STEPS.length - 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const canAdvance = [
    !!productId,
    !!versionId,
    !!orgName && !!orgEmail,
    !!templateKey && durationDays > 0,
    participants.some((p) => p.email),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">New pilot</h1>
        <p className="text-sm text-slate-400">Product → version → customer → template → duration → roles → feature set → provision → verify → invite.</p>
      </div>

      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className={`rounded px-2 py-1 ${i === step ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && <p className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        {step === 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-200">Select a product</span>
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded border border-slate-800 px-3 py-2 hover:bg-slate-800">
                <input type="radio" name="product" checked={productId === p.id} onChange={() => { setProductId(p.id); setVersionId(""); }} />
                <span>{p.name}</span>
                <span className="text-xs text-slate-500">({p.key})</span>
              </label>
            ))}
          </div>
        )}

        {step === 1 && product && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-200">Select a version of {product.name}</span>
            {product.versions.map((v) => (
              <label key={v.id} className="flex items-center gap-2 rounded border border-slate-800 px-3 py-2 hover:bg-slate-800">
                <input type="radio" name="version" checked={versionId === v.id} onChange={() => { setVersionId(v.id); setFeatureKeys(v.features?.filter((f) => f.defaultEnabled).map((f) => f.key) ?? []); }} />
                <span>{v.version}</span>
                <span className="text-xs text-slate-500">adapter: {v.adapterKey}</span>
              </label>
            ))}
            {product.environmentTypes && product.environmentTypes.length > 0 && (
              <div className="mt-2">
                <label className="text-xs text-slate-400">Environment type</label>
                <select className="ml-2 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm" value={environmentTypeKey} onChange={(e) => setEnvironmentTypeKey(e.target.value)}>
                  {product.environmentTypes.map((et) => (
                    <option key={et.id} value={et.key}>
                      {et.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-200">Prospect / customer organization</span>
            <input className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm" placeholder="Organization name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            <input className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm" placeholder="Primary contact email" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} />
            <input className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm" placeholder="Primary contact name (optional)" value={orgContactName} onChange={(e) => setOrgContactName(e.target.value)} />
            <input className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm" placeholder="Pilot name (optional, auto-generated if blank)" value={pilotName} onChange={(e) => setPilotName(e.target.value)} />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-200">Demonstration template &amp; duration</span>
            <input className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm" placeholder="Template key" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} />
            <label className="text-xs text-slate-400">
              Trial duration (days)
              <input
                type="number"
                min={1}
                max={90}
                className="ml-2 w-24 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
              />
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div>
              <span className="text-sm font-medium text-slate-200">Feature set</span>
              <div className="mt-1 flex flex-col gap-1">
                {(version?.features ?? []).map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={featureKeys.includes(f.key)}
                      onChange={(e) =>
                        setFeatureKeys(e.target.checked ? [...featureKeys, f.key] : featureKeys.filter((k) => k !== f.key))
                      }
                    />
                    {f.label} <span className="text-xs text-slate-500">({f.key})</span>
                  </label>
                ))}
                {(version?.features ?? []).length === 0 && <p className="text-xs text-slate-500">This version has no optional features.</p>}
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-200">Participants &amp; roles</span>
              <div className="mt-1 flex flex-col gap-2">
                {participants.map((row, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                      placeholder="email"
                      value={row.email}
                      onChange={(e) => setParticipants(participants.map((r, idx) => (idx === i ? { ...r, email: e.target.value } : r)))}
                    />
                    <input
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                      placeholder="display name (optional)"
                      value={row.displayName}
                      onChange={(e) => setParticipants(participants.map((r, idx) => (idx === i ? { ...r, displayName: e.target.value } : r)))}
                    />
                    <select
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                      value={row.role}
                      onChange={(e) => setParticipants(participants.map((r, idx) => (idx === i ? { ...r, role: e.target.value as PilotRole } : r)))}
                    >
                      <option value="primary_contact">primary_contact</option>
                      <option value="evaluator">evaluator</option>
                      <option value="observer">observer</option>
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  className="self-start text-xs text-indigo-400 hover:text-indigo-300"
                  onClick={() => setParticipants([...participants, { email: "", displayName: "", role: "evaluator" }])}
                >
                  + add participant
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-3">
            {!createdPilotId && (
              <div>
                <p className="mb-2 text-sm text-slate-300">
                  Ready to create <strong>{pilotName || `${orgName} — ${product?.name} pilot`}</strong>, provision it, and issue invitations
                  for {participants.filter((p) => p.email).length} participant(s).
                </p>
                <button disabled={busy} onClick={runFullSubmit} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
                  {busy ? "Working…" : "Provision & invite"}
                </button>
              </div>
            )}
            {createdPilotId && !done && (
              <p className="text-sm text-slate-400">Pilot created — provisioning environment and issuing invitations…</p>
            )}
            {createdPilotId && done && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-emerald-400">Pilot created and provisioned.</p>
                <pre className="max-h-32 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400">{JSON.stringify(provisionResult, null, 2)}</pre>
                <div>
                  <h3 className="mb-1 text-sm font-medium text-slate-200">Invitation links (shown once — copy now)</h3>
                  <ul className="flex flex-col gap-1 text-xs">
                    {invitations.map((inv) => (
                      <li key={inv.email} className="rounded bg-slate-950 p-2">
                        <div className="text-slate-300">{inv.email}</div>
                        <code className="break-all text-emerald-400">{inv.rawToken}</code>
                        <div className="text-slate-500">expires {new Date(inv.expiresAt).toLocaleString()}</div>
                      </li>
                    ))}
                  </ul>
                </div>
                <button onClick={() => navigate(`/pilots/${createdPilotId}`)} className="self-start rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
                  Go to pilot detail →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {step < STEPS.length - 1 && (
        <div className="flex justify-between">
          <button disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-30">
            Back
          </button>
          <button
            disabled={!canAdvance[step]}
            onClick={() => setStep(step + 1)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
