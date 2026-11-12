"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { NIGERIAN_STATES, BLOOD_TYPES, expiryStatus, whatsAppLink } from "../lib/utils";
import ExpiryRing from "../components/ExpiryRing";

export default function PublicBoard() {
  const [state, setState] = useState("Nasarawa");
  const [hospitals, setHospitals] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel;
    async function load() {
      setLoading(true);
      const { data: hosp } = await supabase.from("hospitals").select("*").eq("state", state);
      const hospIds = (hosp || []).map((h) => h.id);
      const { data: inv } = hospIds.length
        ? await supabase.from("blood_inventory").select("*").in("hospital_id", hospIds)
        : { data: [] };
      setHospitals(hosp || []);
      setInventory(inv || []);
      setLoading(false);
    }
    load();

    channel = supabase
      .channel("public-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "blood_inventory" }, load)
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [state]);

  const byType = useMemo(() => {
    const map = Object.fromEntries(BLOOD_TYPES.map((t) => [t, { units: 0, batches: [] }]));
    for (const item of inventory) {
      if (!map[item.blood_type]) continue;
      map[item.blood_type].units += item.units_available;
      map[item.blood_type].batches.push(item);
    }
    return map;
  }, [inventory]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      
      {/* 1. CLEAN WHITE BRANDING TOP HEADER BANNER */}
      <nav className="bg-white text-slate-900 sticky top-0 z-50 shadow-sm border-b hairline">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black tracking-tighter text-[#D61C38]">🩸 BLOODLINK</span>
            <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded font-mono uppercase tracking-wider">
              Coldchain
            </span>
          </div>
          
          {/* Menu Items & Action Boxes Shifted Cleanly to the Far Right Edge */}
          <div className="flex flex-wrap items-center gap-4 font-mono text-xs w-full sm:w-auto justify-end">
            <div className="relative group py-2">
              <span className="text-slate-600 hover:text-slate-900 font-bold transition cursor-pointer pb-1 border-b-2 border-transparent hover:border-[#D61C38]">
                Why Donate? 🩺
              </span>
              {/* Dropdown containing life saving benefit points */}
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-3 space-y-2 text-left">
                <p className="text-slate-800 font-bold border-b pb-1 text-[11px] uppercase tracking-wider text-[#D61C38]">Donation Benefits:</p>
                <p className="text-slate-600 font-sans text-xs">• Save up to 3 lives per pint</p>
                <p className="text-slate-600 font-sans text-xs">• Free mini-health checkups</p>
                <p className="text-slate-600 font-sans text-xs">• Promotes cardiovascular health</p>
                <p className="text-slate-600 font-sans text-xs">• Enhances blood cell regeneration</p>
              </div>
            </div>
            
            <Link 
              href="/dashboard" 
              className="px-4 py-2 bg-slate-900 text-white font-black uppercase tracking-wider hover:bg-slate-800 transition rounded-md border border-slate-900"
            >
              Staff Portal 🔐
            </Link>
            <Link 
              href="/donors" 
              className="px-4 py-2 bg-[#D61C38] text-white font-black uppercase tracking-wider hover:bg-[#b8142c] transition rounded-md border border-[#D61C38] shadow-sm"
            >
              Donor Registry ♥
            </Link>
          </div>
        </div>
      </nav>

      {/* MAIN CONTAINER FRAMEWORK */}
      <div className="max-w-7xl mx-auto px-6 mt-10 space-y-12">
        
        {/* 2. HERO SPLIT SECTION (BRIGHT WHITE DESIGN FORMAT) */}
        <header className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200/80">
          
          {/* Left Text Block - Maximum Visual Impact */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 bg-red-50 text-[#D61C38] px-3 py-1 rounded-md font-mono text-xs font-bold tracking-wider border border-red-100">
              <span className="w-2 h-2 rounded-full bg-[#D61C38] animate-pulse" />
              LIVE GRID OVERVIEW &middot; PUBLIC BROADCAST
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-none uppercase">
              DONATE BLOOD!!!
            </h1>
            
            <div className="space-y-4 text-slate-700 text-lg leading-relaxed">
              <p className="font-bold text-slate-900 text-xl">
                Real-time asset mapping across <span className="underline decoration-[#D61C38] decoration-4 font-black text-black">{state} State</span> healthcare infrastructures.
              </p>
              <p className="font-medium text-slate-500">
                We have so many great heroes who help us in contributing towards the betterment of our health delivery systems. Built for the critical seconds that matter when a patient cannot wait for a phone chain.
              </p>
            </div>
            
            {/* Inline Control Interfaces */}
            <div className="pt-4 flex flex-wrap gap-4 items-center">
              <Link 
                href="/donors" 
                className="inline-flex items-center justify-center font-black tracking-wide px-8 py-4 bg-[#D61C38] hover:bg-[#b8142c] text-white text-base rounded-lg shadow-md transition-all active:scale-98"
              >
                Donor Registration &rarr;
              </Link>
              
              {/* Premium Expanded State Selector Card Component */}
              <div className="flex items-center gap-3 bg-slate-100 border border-slate-200 p-2 rounded-lg shadow-inner">
                <span className="text-xs font-mono font-black tracking-widest text-slate-500 pl-2 uppercase">JURISDICTION:</span>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="bg-white text-slate-800 border border-slate-200 hover:border-slate-300 font-black text-base rounded-md px-5 py-2 cursor-pointer outline-none transition focus:ring-2 focus:ring-[#D61C38]"
                >
                  {NIGERIAN_STATES.map((s) => (
                    <option key={s} value={s} className="bg-white text-slate-900 font-sans">{s} State</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Right Graphics Metric Box */}
          <div className="lg:col-span-5 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center min-h-[320px] relative overflow-hidden">
            <div className="w-24 h-24 bg-[#D61C38]/10 rounded-full flex items-center justify-center text-5xl mb-4 shadow-inner transform hover:rotate-12 transition duration-300">
              ❤️
            </div>
            <div className="space-y-2 z-10">
              <p className="font-mono text-sm tracking-widest text-[#D61C38] font-bold uppercase">Coldchain Monitor Active</p>
              <p className="text-slate-900 font-black text-2xl tracking-tight">{hospitals.length} Linked Nodes</p>
              <p className="text-xs text-slate-500 max-w-xs font-mono mt-1">
                Real-time system data streaming pipeline from localized depository network nodes.
              </p>
            </div>
          </div>
        </header>

        {loading && (
          <p className="text-muted font-mono text-xs animate-pulse">Synchronizing live storage array...</p>
        )}

        {/* 3. ORIGINAL AGGREGATED STOCK TILES METRICS SECTION (MAINTAINING THE OLD DESIGN CLASS SETS) */}
        <section className="space-y-4">
          <h3 className="font-mono text-xs text-muted uppercase tracking-widest">
            Regional Stock Aggregation
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...BLOOD_TYPES].sort((a, b) => (a === "O-" ? -1 : b === "O-" ? 1 : 0)).map((type) => {
              const entry = byType[type];
              const critical = entry.units <= 2;
              const isEmpty = entry.units === 0;

              return (
                <div
                  key={type}
                  className={`card p-5 flex flex-col gap-3 transition-all ${
                    isEmpty ? "border-blood" : critical && entry.units > 0 ? "border-warn" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-2xl text-ink">{type}</span>
                    {isEmpty ? (
                      <span className="text-[9px] font-mono bg-blood/10 text-blood px-1.5 py-0.5 rounded uppercase font-bold">Depleted</span>
                    ) : critical ? (
                      <span className="text-[9px] font-mono bg-warn/10 text-warn px-1.5 py-0.5 rounded uppercase font-bold">Critical</span>
                    ) : (
                      <span className="text-[9px] font-mono bg-safe/10 text-safe px-1.5 py-0.5 rounded uppercase font-bold">Stable</span>
                    )}
                  </div>
                  <div>
                    <span className="font-mono text-3xl font-semibold text-ink">{entry.units}</span>
                    <span className="text-muted text-xs ml-1 font-mono">units</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {entry.batches.slice(0, 4).map((b) => (
                      <ExpiryRing key={b.id} expiryDate={b.batch_expiry_date} size={28} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. HOSPITAL DIRECTORY LIST SECTION (MAINTAINING THE OLD DESIGN CLASS SETS) */}
        <section className="space-y-4">
          <h3 className="font-display text-xl md:text-2xl font-black uppercase tracking-wide text-slate-900">
            Hospitals in <span className="text-[#D61C38] font-black underline decoration-[#D61C38] decoration-4 underline-offset-4">{state}{state === "FCT" ? "" : " State"}</span>
          </h3>
          <div className="space-y-3">
            {hospitals.map((h) => {
              const hInventory = inventory.filter((i) => i.hospital_id === h.id);
              const total = hInventory.reduce((sum, i) => sum + i.units_available, 0);
              return (
                <div key={h.id} className="card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-ink font-medium">{h.name}</p>
                    <p className="text-muted text-sm">📍 {h.address}</p>
                  </div>
                  <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-2 md:pt-0 border-ink/5">
                    <span className="font-mono text-xs text-muted">{total} units total</span>
                    <div className="flex gap-2">
                      <a
                        href={whatsAppLink(h.emergency_phone, `Emergency blood inquiry via BloodLink for ${h.name}.`)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-mono px-3 py-1.5 rounded border border-safe text-safe hover:bg-safe/10 transition"
                      >
                        WhatsApp
                      </a>
                      <a
                        href={`tel:${h.emergency_phone}`}
                        className="text-xs font-mono px-3 py-1.5 rounded border border-blood text-blood hover:bg-blood/10 transition"
                      >
                        Call
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && hospitals.length === 0 && (
              <p className="text-muted text-sm font-mono">No registered facilities in this state node yet.</p>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}