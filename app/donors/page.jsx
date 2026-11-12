"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { BLOOD_TYPES, NIGERIAN_STATES, whatsAppLink } from "../../lib/utils";
import { writeOrQueue } from "../../lib/offlineQueue";

export default function Donors() {
  const [donors, setDonors] = useState([]);
  const [state, setState] = useState("Nasarawa");
  const [typeFilter, setTypeFilter] = useState("O-");
  const [form, setForm] = useState({ full_name: "", phone: "", blood_type: "O+", state: "Nasarawa", lga: "" });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    supabase.from("donors").select("*").eq("state", state).then(({ data }) => setDonors(data || []));
  }, [state]);

  async function register(e) {
    e.preventDefault();
    if (!form.full_name || !form.phone) return;
    await writeOrQueue({ table: "donors", type: "insert", payload: form });
    setSubmitted(true);
    setForm({ full_name: "", phone: "", blood_type: "O+", state, lga: "" });
  }

  const filtered = donors.filter((d) => d.blood_type === typeFilter && d.whatsapp_opt_in);

  return (
    <main className="min-h-screen px-5 py-8 md:px-10 md:py-12 max-w-4xl mx-auto">
      <header className="border-b hairline pb-6 mb-8">
        <p className="font-mono text-xs tracking-widest text-safe uppercase mb-2">Community Network</p>
        <h1 className="font-display text-3xl font-semibold text-ink">Donor Registry</h1>
        <p className="text-muted mt-2">
          Register once. When a hospital in your state posts a shortage, staff can reach you directly
          on WhatsApp — no calls, no middlemen, no cost to you.
        </p>
      </header>

      {/* Registration */}
      <section className="card p-5 mb-10">
        <h2 className="font-display text-lg text-ink mb-4">Become a donor</h2>
        {submitted ? (
          <p className="text-safe text-sm font-mono">Registered — thank you. You can add another below.</p>
        ) : null}
        <form onSubmit={register} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Full name" value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink" required />
          <input placeholder="Phone (WhatsApp), e.g. +2348012345678" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink" required />
          <select value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink">
            {BLOOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink">
            {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input placeholder="LGA (optional)" value={form.lga}
            onChange={(e) => setForm({ ...form, lga: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink md:col-span-2" />
          <button type="submit" className="bg-safe text-bg font-mono text-sm px-4 py-2 rounded md:col-span-2 font-medium">
            Register as donor
          </button>
        </form>
      </section>

      {/* Mobilize */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-lg text-ink">Mobilize donors</h2>
          <select value={state} onChange={(e) => setState(e.target.value)}
            className="bg-surface border hairline rounded px-2 py-1 text-sm text-ink">
            {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-surface border hairline rounded px-2 py-1 text-sm text-ink">
            {BLOOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          {filtered.map((d) => (
            <div key={d.id} className="card p-3 flex items-center justify-between">
              <div>
                <p className="text-ink text-sm">{d.full_name} <span className="text-muted font-mono">· {d.blood_type}</span></p>
                <p className="text-xs text-muted">{d.lga ? `${d.lga}, ` : ""}{d.state}</p>
              </div>
              <a
                href={whatsAppLink(d.phone, `Hi ${d.full_name}, this is a hospital in ${d.state} on BloodLink. We're short on ${d.blood_type} blood — would you be able to donate today?`)}
                target="_blank" rel="noreferrer"
                className="text-xs font-mono px-3 py-1.5 rounded border border-safe text-safe hover:bg-safe/10 transition"
              >
                Notify on WhatsApp
              </a>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-muted text-sm">No {typeFilter} donors registered in {state} yet.</p>}
        </div>
      </section>
    </main>
  );
}
