"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { BLOOD_TYPES, expiryStatus, outageRisk } from "../../lib/utils";
import { writeOrQueue, getQueueLength, flushQueue } from "../../lib/offlineQueue";
import ExpiryRing from "../../components/ExpiryRing";

export default function Dashboard() {
  const [hospitals, setHospitals] = useState([]);
  const [hospitalId, setHospitalId] = useState("");
  const [inventory, setInventory] = useState([]);
  const [outages, setOutages] = useState([]);
  const [queueLen, setQueueLen] = useState(0);
  const [form, setForm] = useState({ blood_type: "O+", units_available: 1, batch_expiry_date: "" });
  const [savingOutage, setSavingOutage] = useState(false);

  useEffect(() => {
    supabase.from("hospitals").select("*").order("name").then(({ data }) => {
      setHospitals(data || []);
      if (data?.length) setHospitalId(data[0].id);
    });
    setQueueLen(getQueueLength());
  }, []);

  useEffect(() => {
    if (!hospitalId) return;
    async function load() {
      const { data: inv } = await supabase
        .from("blood_inventory").select("*").eq("hospital_id", hospitalId).order("batch_expiry_date");
      const { data: out } = await supabase
        .from("outage_logs").select("*").eq("hospital_id", hospitalId).order("start_time", { ascending: false }).limit(5);
      setInventory(inv || []);
      setOutages(out || []);
    }
    load();

    const channel = supabase
      .channel(`dashboard-${hospitalId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blood_inventory", filter: `hospital_id=eq.${hospitalId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "outage_logs", filter: `hospital_id=eq.${hospitalId}` }, load)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [hospitalId]);

  async function addBatch(e) {
    e.preventDefault();
    if (!form.batch_expiry_date) return;
    const payload = { hospital_id: hospitalId, ...form, units_available: Number(form.units_available) };
    const res = await writeOrQueue({ table: "blood_inventory", type: "insert", payload });
    setQueueLen(getQueueLength());
    if (!res.queued) {
      const { data } = await supabase.from("blood_inventory").select("*").eq("hospital_id", hospitalId).order("batch_expiry_date");
      setInventory(data || []);
    } else {
      setInventory((prev) => [...prev, { ...payload, id: `local-${Date.now()}` }]);
    }
    setForm({ blood_type: "O+", units_available: 1, batch_expiry_date: "" });
  }

  async function adjustUnits(item, delta) {
    const newUnits = Math.max(0, item.units_available + delta);
    const res = await writeOrQueue({
      table: "blood_inventory", type: "update",
      payload: { units_available: newUnits }, match: { id: item.id },
    });
    setQueueLen(getQueueLength());
    setInventory((prev) => prev.map((i) => (i.id === item.id ? { ...i, units_available: newUnits } : i)));
  }

  async function startOutage(generatorBackup) {
    setSavingOutage(true);
    await writeOrQueue({
      table: "outage_logs", type: "insert",
      payload: { hospital_id: hospitalId, generator_backup: generatorBackup, start_time: new Date().toISOString() },
    });
    setQueueLen(getQueueLength());
    const { data } = await supabase.from("outage_logs").select("*").eq("hospital_id", hospitalId).order("start_time", { ascending: false }).limit(5);
    setOutages(data || []);
    setSavingOutage(false);
  }

  async function endOutage(outageId) {
    await writeOrQueue({
      table: "outage_logs", type: "update",
      payload: { end_time: new Date().toISOString() }, match: { id: outageId },
    });
    setQueueLen(getQueueLength());
    const { data } = await supabase.from("outage_logs").select("*").eq("hospital_id", hospitalId).order("start_time", { ascending: false }).limit(5);
    setOutages(data || []);
  }

  const ongoingOutage = outages.find((o) => !o.end_time);
  const risk = ongoingOutage ? outageRisk(ongoingOutage) : null;

  return (
    <main className="min-h-screen px-5 py-8 md:px-10 md:py-12 max-w-5xl mx-auto">
      <header className="flex items-center justify-between border-b hairline pb-6 mb-8">
        <div>
          <p className="font-mono text-xs tracking-widest text-muted uppercase mb-2">Staff Console</p>
          <h1 className="font-display text-3xl font-semibold text-ink">Inventory Control</h1>
        </div>
        <div className="text-right">
          {queueLen > 0 ? (
            <button
              onClick={() => flushQueue(() => setQueueLen(getQueueLength()))}
              className="text-xs font-mono px-3 py-1.5 rounded border border-warn text-warn animate-pulse-ring"
            >
              {queueLen} unsynced — tap to retry
            </button>
          ) : (
            <span className="text-xs font-mono text-safe">● synced</span>
          )}
        </div>
      </header>

      <select
        value={hospitalId}
        onChange={(e) => setHospitalId(e.target.value)}
        className="bg-surface border hairline rounded px-3 py-2 text-ink mb-8 w-full md:w-80"
      >
        {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>

      {/* Cold-chain risk banner */}
      {ongoingOutage && (
        <div className={`card p-4 mb-8 border ${risk.atRisk ? "border-blood" : "border-warn"}`}>
          <p className="font-mono text-xs uppercase tracking-wide mb-1" style={{ color: risk.atRisk ? "#E4362E" : "#F0A93A" }}>
            {risk.atRisk ? "Cold-chain risk — spoilage possible" : "Power outage in progress"}
          </p>
          <p className="text-ink text-sm">
            Ongoing for {risk.hours}h {ongoingOutage.generator_backup ? "(generator backup active)" : "(no backup power)"}.
          </p>
          <button onClick={() => endOutage(ongoingOutage.id)} className="mt-2 text-xs font-mono underline text-muted hover:text-ink">
            Mark power restored
          </button>
        </div>
      )}
      {!ongoingOutage && (
        <div className="flex gap-3 mb-8">
          <button onClick={() => startOutage(false)} disabled={savingOutage}
            className="text-xs font-mono px-3 py-2 rounded border border-line text-muted hover:text-warn hover:border-warn transition">
            Log power outage
          </button>
          <button onClick={() => startOutage(true)} disabled={savingOutage}
            className="text-xs font-mono px-3 py-2 rounded border border-line text-muted hover:text-safe hover:border-safe transition">
            Log outage (generator on)
          </button>
        </div>
      )}

      {/* Add batch */}
      <form onSubmit={addBatch} className="card p-5 mb-8 flex flex-col md:flex-row gap-3 md:items-end">
        <div>
          <label className="text-xs font-mono text-muted block mb-1">Blood type</label>
          <select value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink">
            {BLOOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-mono text-muted block mb-1">Units</label>
          <input type="number" min="1" value={form.units_available}
            onChange={(e) => setForm({ ...form, units_available: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink w-24" />
        </div>
        <div>
          <label className="text-xs font-mono text-muted block mb-1">Batch expiry date</label>
          <input type="date" value={form.batch_expiry_date}
            onChange={(e) => setForm({ ...form, batch_expiry_date: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink" />
        </div>
        <button type="submit" className="bg-blood text-white font-mono text-sm px-4 py-2 rounded hover:bg-blood-dim transition">
          + Add batch
        </button>
      </form>

      {/* Inventory list */}
      <div className="space-y-2">
        {inventory.map((item) => {
          const { level } = expiryStatus(item.batch_expiry_date);
          return (
            <div key={item.id} className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <ExpiryRing expiryDate={item.batch_expiry_date} size={44} />
                <div>
                  <p className="font-display text-lg text-ink">{item.blood_type}</p>
                  <p className="text-xs text-muted font-mono">
                    exp {item.batch_expiry_date} · {level}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => adjustUnits(item, -1)} className="w-7 h-7 rounded border hairline text-ink hover:border-blood">−</button>
                <span className="font-mono w-6 text-center text-ink">{item.units_available}</span>
                <button onClick={() => adjustUnits(item, 1)} className="w-7 h-7 rounded border hairline text-ink hover:border-safe">+</button>
              </div>
            </div>
          );
        })}
        {inventory.length === 0 && <p className="text-muted text-sm">No batches logged yet.</p>}
      </div>
    </main>
  );
}
