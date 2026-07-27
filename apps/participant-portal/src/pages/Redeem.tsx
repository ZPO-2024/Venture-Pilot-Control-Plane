import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { getSessionToken, setSessionToken } from "../lib/session";
import type { RedeemResult } from "../lib/types";

export default function Redeem() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"working" | "error">("working");

  useEffect(() => {
    if (!token) return;

    if (getSessionToken()) {
      navigate("/", { replace: true });
      return;
    }

    api
      .postPublic<RedeemResult>(`/invitations/${token}/redeem`, {})
      .then((result) => {
        setSessionToken(result.rawSessionToken);
        navigate("/", { replace: true });
      })
      .catch((err) => {
        setStatus("error");
        if (err instanceof ApiError) {
          if (err.code === "invitation_expired") setError("This invitation has expired. Ask your contact for a new one.");
          else if (err.code === "invitation_already_redeemed") setError("This invitation has already been used.");
          else setError("This invitation link is invalid.");
        } else {
          setError("Something went wrong redeeming this invitation.");
        }
      });
  }, [token, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 text-center shadow-xl">
        {status === "working" && <p className="text-slate-300">Redeeming your invitation…</p>}
        {status === "error" && (
          <>
            <h1 className="mb-2 text-lg font-semibold text-red-400">Invitation not valid</h1>
            <p className="text-sm text-slate-400">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
