import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { clearSessionToken, getSessionToken } from "../lib/session";
import type { SessionInfo } from "../lib/types";

type LoadState = "loading" | "no-session" | "denied" | "ready";

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 48) return `${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `${hours} hours`;
  return `${Math.floor(ms / (1000 * 60))} minutes`;
}

function FeedbackForm({ onSubmit }: { onSubmit: (body: { category: "general" | "issue"; rating?: number; comment?: string; subject?: string }) => Promise<void> }) {
  const [category, setCategory] = useState<"general" | "issue">("general");
  const [rating, setRating] = useState(5);
  const [subject, setSubject] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) return <p className="text-sm text-emerald-400">Thanks — your {category === "issue" ? "issue report" : "feedback"} was submitted.</p>;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit({ category, rating: category === "general" ? rating : undefined, comment, subject: category === "issue" ? subject : undefined });
          setDone(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex gap-2 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" checked={category === "general"} onChange={() => setCategory("general")} /> Feedback
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={category === "issue"} onChange={() => setCategory("issue")} /> Report an issue
        </label>
      </div>
      {category === "general" && (
        <label className="text-sm text-slate-400">
          Rating
          <select className="ml-2 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      {category === "issue" && (
        <input className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      )}
      <textarea
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        placeholder={category === "issue" ? "What went wrong?" : "Anything you'd like us to know?"}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button disabled={busy} className="self-start rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
        Submit
      </button>
    </form>
  );
}

function RequestButton({ label, onRequest }: { label: string; onRequest: () => Promise<void> }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") return <p className="text-sm text-emerald-400">{label} requested — an admin will follow up.</p>;

  return (
    <div>
      <button
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            await onRequest();
            setState("done");
          } catch (err) {
            setState("error");
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
        className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
      >
        {label}
      </button>
      {state === "error" && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<LoadState>("loading");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [workflowDone, setWorkflowDone] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!getSessionToken()) {
      setState("no-session");
      return;
    }
    api
      .get<SessionInfo>("/participant/session")
      .then((info) => {
        setSession(info);
        setState("ready");
        if (!startedRef.current) {
          startedRef.current = true;
          void api.post("/participant/events", { type: "session_started", metadata: {} });
          void api.post("/participant/events", { type: "product_opened", metadata: { productName: info.productName } });
        }
      })
      .catch((err) => {
        clearSessionToken();
        setState(err instanceof ApiError ? "denied" : "denied");
      });
  }, []);

  if (state === "loading") return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>;

  if (state === "no-session") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md text-center text-slate-400">
          <h1 className="mb-2 text-lg font-semibold text-slate-200">No active trial session</h1>
          <p className="text-sm">Use the invitation link your contact sent you to access your pilot.</p>
        </div>
      </div>
    );
  }

  if (state === "denied" || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-lg font-semibold text-amber-400">Your access has expired or been revoked</h1>
          <p className="text-sm text-slate-400">If you believe this is a mistake, contact the person who invited you to this trial.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-16">
      <header className="border-b border-slate-800 bg-slate-900 px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">{session.pilotName}</h1>
            <p className="text-sm text-slate-400">{session.productName}</p>
          </div>
          <button
            onClick={async () => {
              try {
                await api.post("/participant/logout", {});
              } finally {
                clearSessionToken();
                setState("no-session");
              }
            }}
            className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-sm text-amber-200">{session.syntheticDataNotice}</div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
          Trial expires in <strong className="text-slate-100">{timeUntil(session.expiresAt)}</strong> · role: {session.role}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Your demo workspace</h2>
          <ul className="flex flex-col gap-2">
            {session.visibleFeatureKeys.map((key) => (
              <li key={key} className="flex items-center justify-between rounded bg-slate-950 px-3 py-2 text-sm">
                <span className="text-slate-200">{key.replace(/_/g, " ")}</span>
                <button
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                  onClick={() => void api.post("/participant/events", { type: "major_feature_entered", metadata: { feature: key } })}
                >
                  Explore →
                </button>
              </li>
            ))}
            {session.visibleFeatureKeys.length === 0 && <li className="text-sm text-slate-500">No features enabled for this trial yet.</li>}
          </ul>

          <div className="mt-3">
            {workflowDone ? (
              <p className="text-sm text-emerald-400">Demonstration workflow marked complete.</p>
            ) : (
              <button
                onClick={async () => {
                  await api.post("/participant/events", { type: "demonstration_workflow_completed", metadata: {} });
                  setWorkflowDone(true);
                }}
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
              >
                Mark demonstration workflow complete
              </button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Feedback</h2>
          <FeedbackForm
            onSubmit={(body) => api.post(`/pilots/${session.pilotProgramId}/feedback`, body).then(() => undefined)}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <RequestButton label="Request extension" onRequest={() => api.post("/participant/extension-requests", {}).then(() => undefined)} />
          <RequestButton label="Request data export" onRequest={() => api.post("/participant/export-requests", {}).then(() => undefined)} />
        </div>
      </main>
    </div>
  );
}
