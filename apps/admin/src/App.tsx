import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getAdminToken, setAdminToken, clearAdminToken } from "./lib/auth";

function ConnectScreen({ onConnected }: { onConnected: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h1 className="mb-1 text-lg font-semibold text-slate-100">Venture Pilot Control Plane</h1>
        <p className="mb-4 text-sm text-slate-400">
          Enter the admin API token (local/demo shared-secret — see <code>.env</code> <code>ADMIN_API_TOKEN</code>).
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim()) return;
            setAdminToken(value.trim());
            onConnected();
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Admin token"
            className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            autoFocus
          />
          <button type="submit" className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/products", label: "Product registry" },
  { to: "/pilots", label: "Pilots" },
  { to: "/pilots/new", label: "New pilot" },
];

export default function App() {
  const [token, setToken] = useState(getAdminToken());
  const [menuOpen, setMenuOpen] = useState(false);

  if (!token) {
    return <ConnectScreen onConnected={() => setToken(getAdminToken())} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-wide text-slate-100">Venture Pilot Control Plane</span>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">local/demo</span>
          </div>
          <button
            className="rounded border border-slate-700 px-2 py-1 text-sm text-slate-300 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
          >
            Menu
          </button>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm ${isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => {
                clearAdminToken();
                setToken(null);
              }}
              className="ml-2 rounded px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800"
            >
              Disconnect
            </button>
          </nav>
        </div>
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-800 px-4 py-2 md:hidden">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded px-3 py-2 text-sm ${isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => {
                clearAdminToken();
                setToken(null);
              }}
              className="rounded px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800"
            >
              Disconnect
            </button>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
