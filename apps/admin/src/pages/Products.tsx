import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Product } from "../lib/types";

const KNOWN_ADAPTERS = ["document-concierge-demo", "forgeflow-kds-demo", "generic-web-application"];

function NewProductForm({ onCreated }: { onCreated: () => void }) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api.post("/products", { key, name, description: description || undefined });
          setKey("");
          setName("");
          setDescription("");
          onCreated();
        } catch (err) {
          setError(String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-sm font-semibold text-slate-200">Register a product</h3>
      <input
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        placeholder="key (e.g. document-concierge)"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        required
      />
      <input
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        placeholder="Display name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button disabled={busy} className="self-start rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
        Register product
      </button>
    </form>
  );
}

interface FeatureRow {
  key: string;
  label: string;
  defaultEnabled: boolean;
}

function NewVersionForm({ product, onCreated }: { product: Product; onCreated: () => void }) {
  const [version, setVersion] = useState("");
  const [adapterKey, setAdapterKey] = useState(KNOWN_ADAPTERS[0]);
  const [environmentTypeKey, setEnvironmentTypeKey] = useState("sandbox");
  const [features, setFeatures] = useState<FeatureRow[]>([{ key: "", label: "", defaultEnabled: false }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-950 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api.post(`/products/${product.id}/versions`, {
            version,
            adapterKey,
            features: features.filter((f) => f.key).map((f) => ({ key: f.key, label: f.label || f.key, defaultEnabled: f.defaultEnabled })),
            healthChecks: [{ key: "adapter_reachable", label: "Adapter reachable" }],
            environmentTypes: [{ key: environmentTypeKey, label: environmentTypeKey }],
          });
          setVersion("");
          setFeatures([{ key: "", label: "", defaultEnabled: false }]);
          onCreated();
        } catch (err) {
          setError(String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
          placeholder="version (e.g. 0.1.0-demo)"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          required
        />
        <select className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm" value={adapterKey} onChange={(e) => setAdapterKey(e.target.value)}>
          {KNOWN_ADAPTERS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
          placeholder="environment type key"
          value={environmentTypeKey}
          onChange={(e) => setEnvironmentTypeKey(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Features</span>
        {features.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
              placeholder="feature key"
              value={f.key}
              onChange={(e) => setFeatures(features.map((row, idx) => (idx === i ? { ...row, key: e.target.value } : row)))}
            />
            <input
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
              placeholder="label"
              value={f.label}
              onChange={(e) => setFeatures(features.map((row, idx) => (idx === i ? { ...row, label: e.target.value } : row)))}
            />
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={f.defaultEnabled}
                onChange={(e) => setFeatures(features.map((row, idx) => (idx === i ? { ...row, defaultEnabled: e.target.checked } : row)))}
              />
              default on
            </label>
          </div>
        ))}
        <button
          type="button"
          className="self-start text-xs text-indigo-400 hover:text-indigo-300"
          onClick={() => setFeatures([...features, { key: "", label: "", defaultEnabled: false }])}
        >
          + add feature
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <button disabled={busy} className="self-start rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
        Register version
      </button>
    </form>
  );
}

export default function Products() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [expandedForVersion, setExpandedForVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .get<Product[]>("/products")
      .then(setProducts)
      .catch((e) => setError(String(e)));
  };

  useEffect(load, []);

  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Product registry</h1>
        <p className="text-sm text-slate-400">Products, versions, adapters, and feature/health-check definitions.</p>
      </div>

      <NewProductForm onCreated={load} />

      <div className="flex flex-col gap-4">
        {(products ?? []).map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">{p.name}</h2>
                <p className="text-xs text-slate-500">key: {p.key}</p>
              </div>
              <button
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                onClick={() => setExpandedForVersion(expandedForVersion === p.id ? null : p.id)}
              >
                {expandedForVersion === p.id ? "Cancel" : "+ Register version"}
              </button>
            </div>
            <ul className="mb-2 flex flex-col gap-1 text-sm">
              {p.versions.map((v) => (
                <li key={v.id} className="flex items-center gap-2 text-slate-300">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{v.version}</span>
                  <span className="text-xs text-slate-500">adapter: {v.adapterKey}</span>
                  {v.features && <span className="text-xs text-slate-500">· {v.features.length} feature(s)</span>}
                </li>
              ))}
              {p.versions.length === 0 && <li className="text-xs text-slate-500">No versions registered yet.</li>}
            </ul>
            {expandedForVersion === p.id && <NewVersionForm product={p} onCreated={() => { load(); setExpandedForVersion(null); }} />}
          </div>
        ))}
        {products?.length === 0 && <p className="text-sm text-slate-500">No products registered yet.</p>}
      </div>
    </div>
  );
}
