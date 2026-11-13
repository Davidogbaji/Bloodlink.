"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { BLOOD_TYPES, expiryStatus, outageRisk } from "../../lib/utils";
import { writeOrQueue, getQueueLength, flushQueue, registerAutoSync } from "../../lib/offlineQueue";
import ExpiryRing from "../../components/ExpiryRing";

export default function Dashboard() {
  // Auth state
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authTab, setAuthTab] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [hospitalSearch, setHospitalSearch] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [sessionExpiredAlert, setSessionExpiredAlert] = useState(false);

  // Console data state
  const [hospitals, setHospitals] = useState([]);
  const [hospitalId, setHospitalId] = useState("");
  const [inventory, setInventory] = useState([]);
  const [outages, setOutages] = useState([]);
  const [queueLen, setQueueLen] = useState(0);
  const [form, setForm] = useState({ blood_type: "O+", units_available: 1, batch_expiry_date: "" });
  const [savingOutage, setSavingOutage] = useState(false);

  // Helper to load profile
  const loadUserProfile = useCallback(async (userId, allHospitals = hospitals) => {
    try {
      const { data: prof, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error);
      }

      if (prof) {
        setProfile(prof);
        if (prof.role === "admin") {
          // Admin defaults to their assigned hospital or first available
          if (prof.hospital_id) {
            setHospitalId(prof.hospital_id);
          } else if (allHospitals.length) {
            setHospitalId((prev) => prev || allHospitals[0].id);
          }
        } else {
          // Regular staff: strictly locked to their assigned hospital
          setHospitalId(prof.hospital_id || "");
        }
      } else {
        // Fallback if profile row is pending creation
        setProfile({ id: userId, approved: false, role: "staff" });
      }
    } catch (e) {
      console.error("Exception loading user profile:", e);
      setProfile({ id: userId, approved: false, role: "staff" });
    }
  }, [hospitals]);

  // Initial load: hospitals, session, and auto-sync registration
  useEffect(() => {
    let mounted = true;

    async function init() {
      // 1. Fetch hospitals (public read allowed by RLS)
      const { data: hospData } = await supabase.from("hospitals").select("*").order("name");
      const loadedHospitals = hospData || [];
      if (!mounted) return;
      setHospitals(loadedHospitals);

      // 2. Fetch current auth session
      const { data: authData } = await supabase.auth.getSession();
      const currentSession = authData?.session || null;
      if (!mounted) return;
      setSession(currentSession);

      if (currentSession?.user) {
        await loadUserProfile(currentSession.user.id, loadedHospitals);
      }
      if (mounted) setAuthLoading(false);
    }

    init();

    // Listen for auth state transitions
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (newSession?.user) {
        await loadUserProfile(newSession.user.id);
      } else {
        setProfile(null);
        setHospitalId("");
        setInventory([]);
        setOutages([]);
      }
      setAuthLoading(false);
    });

    setQueueLen(getQueueLength());
    registerAutoSync(({ sessionExpired }) => {
      if (!mounted) return;
      setQueueLen(getQueueLength());
      if (sessionExpired) setSessionExpiredAlert(true);
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [loadUserProfile]);

  // Filtered hospitals grouped by state for the create account dropdown
  const filteredHospitalsByState = useMemo(() => {
    const query = hospitalSearch.trim().toLowerCase();
    const map = {};
    for (const h of hospitals) {
      const match =
        !query ||
        h.name.toLowerCase().includes(query) ||
        h.state.toLowerCase().includes(query) ||
        (h.lga && h.lga.toLowerCase().includes(query));
      if (!match) continue;
      const s = h.state || "Other";
      if (!map[s]) map[s] = [];
      map[s].push(h);
    }
    return map;
  }, [hospitals, hospitalSearch]);

  // Handle Sign In
  async function handleSignIn(e) {
    e.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setSession(data.session);
      if (data.user) {
        await loadUserProfile(data.user.id);
      }
    } catch (err) {
      setAuthError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  // Handle Create Account (Sign Up)
  async function handleSignUp(e) {
    e.preventDefault();
    setAuthError("");
    setAuthMessage("");

    if (!selectedHospitalId) {
      setAuthError("Please select your hospital from the existing list.");
      return;
    }

    setAuthSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            hospital_id: selectedHospitalId,
          },
        },
      });
      if (error) throw error;

      // Handle email confirmation workflows:
      // If email confirmation is required by Supabase project settings, session will be null.
      if (data.user && !data.session) {
        setAuthMessage(
          "Account created! Please check your email to confirm your account. Access starts when BloodLink approves your hospital account."
        );
      } else if (data.session && data.user) {
        // Confirmation is off or auto-confirmed: ensure profile row exists
        await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            full_name: fullName.trim(),
            hospital_id: selectedHospitalId,
            role: "staff",
            approved: false,
          },
          { onConflict: "id" }
        );
        setSession(data.session);
        await loadUserProfile(data.user.id);
      }
    } catch (err) {
      setAuthError(err.message || "Failed to create account. Please try again.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  // Handle Sign Out
  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setHospitalId("");
    setInventory([]);
    setOutages([]);
    setAuthError("");
    setAuthMessage("");
  }

  // Load inventory and outages whenever hospitalId changes
  useEffect(() => {
    if (!hospitalId || !profile?.approved) return;

    async function load() {
      const { data: inv } = await supabase
        .from("blood_inventory")
        .select("*")
        .eq("hospital_id", hospitalId)
        .order("batch_expiry_date");
      const { data: out } = await supabase
        .from("outage_logs")
        .select("*")
        .eq("hospital_id", hospitalId)
        .order("start_time", { ascending: false })
        .limit(5);

      setInventory(inv || []);
      setOutages(out || []);
    }
    load();

    const channel = supabase
      .channel(`dashboard-${hospitalId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blood_inventory", filter: `hospital_id=eq.${hospitalId}` },
        load
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "outage_logs", filter: `hospital_id=eq.${hospitalId}` },
        load
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hospitalId, profile]);

  // Add batch
  async function addBatch(e) {
    e.preventDefault();
    if (!form.batch_expiry_date || !hospitalId) return;
    const payload = {
      hospital_id: hospitalId,
      ...form,
      units_available: Number(form.units_available),
    };
    const res = await writeOrQueue({ table: "blood_inventory", type: "insert", payload });
    setQueueLen(getQueueLength());
    if (!res.queued) {
      const { data } = await supabase
        .from("blood_inventory")
        .select("*")
        .eq("hospital_id", hospitalId)
        .order("batch_expiry_date");
      setInventory(data || []);
    } else {
      setInventory((prev) => [...prev, { ...payload, id: `local-${Date.now()}` }]);
    }
    setForm({ blood_type: "O+", units_available: 1, batch_expiry_date: "" });
  }

  // Adjust units
  async function adjustUnits(item, delta) {
    const newUnits = Math.max(0, item.units_available + delta);
    const res = await writeOrQueue({
      table: "blood_inventory",
      type: "update",
      payload: { units_available: newUnits },
      match: { id: item.id },
    });
    setQueueLen(getQueueLength());
    setInventory((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, units_available: newUnits } : i))
    );
  }

  // Start outage
  async function startOutage(generatorBackup) {
    if (!hospitalId) return;
    setSavingOutage(true);
    await writeOrQueue({
      table: "outage_logs",
      type: "insert",
      payload: {
        hospital_id: hospitalId,
        generator_backup: generatorBackup,
        start_time: new Date().toISOString(),
      },
    });
    setQueueLen(getQueueLength());
    const { data } = await supabase
      .from("outage_logs")
      .select("*")
      .eq("hospital_id", hospitalId)
      .order("start_time", { ascending: false })
      .limit(5);
    setOutages(data || []);
    setSavingOutage(false);
  }

  // End outage
  async function endOutage(outageId) {
    if (!hospitalId) return;
    await writeOrQueue({
      table: "outage_logs",
      type: "update",
      payload: { end_time: new Date().toISOString() },
      match: { id: outageId },
    });
    setQueueLen(getQueueLength());
    const { data } = await supabase
      .from("outage_logs")
      .select("*")
      .eq("hospital_id", hospitalId)
      .order("start_time", { ascending: false })
      .limit(5);
    setOutages(data || []);
  }

  // Manual queue flush
  async function handleManualFlush() {
    const res = await flushQueue(() => setQueueLen(getQueueLength()));
    setQueueLen(getQueueLength());
    if (res?.sessionExpired) {
      setSessionExpiredAlert(true);
    } else {
      setSessionExpiredAlert(false);
      if (hospitalId) {
        const { data: inv } = await supabase
          .from("blood_inventory")
          .select("*")
          .eq("hospital_id", hospitalId)
          .order("batch_expiry_date");
        const { data: out } = await supabase
          .from("outage_logs")
          .select("*")
          .eq("hospital_id", hospitalId)
          .order("start_time", { ascending: false })
          .limit(5);
        setInventory(inv || []);
        setOutages(out || []);
      }
    }
  }

  const ongoingOutage = outages.find((o) => !o.end_time);
  const risk = ongoingOutage ? outageRisk(ongoingOutage) : null;
  const assignedHospital = hospitals.find((h) => h.id === (hospitalId || profile?.hospital_id));
  const isAdmin = profile?.role === "admin";

  // 1. Loading screen
  if (authLoading) {
    return (
      <main className="min-h-screen px-5 py-8 md:px-10 md:py-12 max-w-5xl mx-auto flex items-center justify-center">
        <p className="font-mono text-xs text-muted animate-pulse">Authenticating staff portal...</p>
      </main>
    );
  }

  // 2. Logged-out screen: Sign In / Create Account tabs ONLY
  if (!session || !session.user) {
    return (
      <main className="min-h-screen px-5 py-8 md:px-10 md:py-12 max-w-md mx-auto">
        <header className="text-center mb-8">
          <p className="font-mono text-xs tracking-widest text-muted uppercase mb-2">Staff Portal 🔐</p>
          <h1 className="font-display text-3xl font-semibold text-ink">BloodLink ColdChain</h1>
          <p className="text-sm text-muted mt-1 font-body">Authorized hospital personnel only</p>
        </header>

        {queueLen > 0 && (
          <div className="card p-3 mb-6 border border-warn text-warn text-xs font-mono">
            ⚠ {queueLen} unsynced operations queued offline. Sign in to sync them to the database.
          </div>
        )}

        {/* Tab Toggle */}
        <div className="flex border-b hairline mb-6">
          <button
            type="button"
            onClick={() => {
              setAuthTab("signin");
              setAuthError("");
              setAuthMessage("");
            }}
            className={`flex-1 pb-3 text-xs font-mono tracking-wider uppercase transition ${
              authTab === "signin"
                ? "text-ink border-b-2 border-blood font-semibold"
                : "text-muted hover:text-ink"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthTab("signup");
              setAuthError("");
              setAuthMessage("");
            }}
            className={`flex-1 pb-3 text-xs font-mono tracking-wider uppercase transition ${
              authTab === "signup"
                ? "text-ink border-b-2 border-blood font-semibold"
                : "text-muted hover:text-ink"
            }`}
          >
            Create Account
          </button>
        </div>

        {authError && (
          <div className="card p-3 mb-5 border border-blood text-blood text-xs font-mono">
            {authError}
          </div>
        )}
        {authMessage && (
          <div className="card p-3 mb-5 border border-safe text-safe text-xs font-mono leading-relaxed">
            {authMessage}
          </div>
        )}

        {/* TAB 1: Sign In */}
        {authTab === "signin" && (
          <form onSubmit={handleSignIn} className="card p-6 space-y-4">
            <div>
              <label className="text-xs font-mono text-muted block mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@hospital.org.ng"
                className="bg-surface2 border hairline rounded px-3 py-2 text-ink w-full text-sm outline-none focus:border-blood"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-muted block mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-surface2 border hairline rounded px-3 py-2 text-ink w-full text-sm outline-none focus:border-blood"
              />
            </div>
            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full bg-blood text-white font-mono text-sm py-2.5 rounded hover:bg-blood-dim transition font-medium disabled:opacity-50"
            >
              {authSubmitting ? "Signing in..." : "Sign In to Portal"}
            </button>
          </form>
        )}

        {/* TAB 2: Create Account */}
        {authTab === "signup" && (
          <form onSubmit={handleSignUp} className="card p-6 space-y-4">
            <div>
              <label className="text-xs font-mono text-muted block mb-1">Staff full name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Dr. Amina Bello"
                className="bg-surface2 border hairline rounded px-3 py-2 text-ink w-full text-sm outline-none focus:border-blood"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-muted block mb-1">Work email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="amina.bello@hospital.org.ng"
                className="bg-surface2 border hairline rounded px-3 py-2 text-ink w-full text-sm outline-none focus:border-blood"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-muted block mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="bg-surface2 border hairline rounded px-3 py-2 text-ink w-full text-sm outline-none focus:border-blood"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-muted block mb-1">Select your hospital</label>
              <input
                type="text"
                value={hospitalSearch}
                onChange={(e) => setHospitalSearch(e.target.value)}
                placeholder="Type to filter hospital or state..."
                className="bg-surface2 border hairline rounded px-3 py-1.5 text-ink w-full text-xs mb-2 outline-none"
              />
              <select
                required
                value={selectedHospitalId}
                onChange={(e) => setSelectedHospitalId(e.target.value)}
                className="bg-surface2 border hairline rounded px-3 py-2 text-ink w-full text-sm outline-none focus:border-blood"
              >
                <option value="">Choose registered facility...</option>
                {Object.entries(filteredHospitalsByState).map(([stateName, list]) => (
                  <optgroup key={stateName} label={`${stateName} State`}>
                    {list.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} {h.lga ? `(${h.lga})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[11px] font-mono text-muted mt-1">
                You must pick an existing hospital. New facilities are provisioned by BloodLink.
              </p>
            </div>

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full bg-blood text-white font-mono text-sm py-2.5 rounded hover:bg-blood-dim transition font-medium disabled:opacity-50"
            >
              {authSubmitting ? "Submitting request..." : "Create Account"}
            </button>
          </form>
        )}
      </main>
    );
  }

  // 3. Authenticated but UNAPPROVED user
  if (!profile || !profile.approved) {
    return (
      <main className="min-h-screen px-5 py-8 md:px-10 md:py-12 max-w-lg mx-auto">
        <header className="border-b hairline pb-6 mb-8 text-center">
          <p className="font-mono text-xs tracking-widest text-warn uppercase mb-2">Staff Portal 🔐</p>
          <h1 className="font-display text-3xl font-semibold text-ink">Account Pending Approval</h1>
        </header>

        <div className="card p-6 border border-warn/40 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-warn/10 text-warn flex items-center justify-center font-mono text-xl">
            ⏳
          </div>
          <p className="text-ink text-sm leading-relaxed">
            Your request has been sent. Access starts when BloodLink approves your hospital account.
          </p>
          <div className="bg-surface2 p-3.5 rounded hairline border text-left text-xs font-mono space-y-1.5">
            <p className="text-muted">
              Staff: <span className="text-ink">{profile?.full_name || session.user.email}</span>
            </p>
            <p className="text-muted">
              Email: <span className="text-ink">{session.user.email}</span>
            </p>
            <p className="text-muted">
              Hospital: <span className="text-ink">{assignedHospital?.name || "Selected Facility"}</span>
            </p>
            <p className="text-muted">
              Status: <span className="text-warn font-bold">Pending Administrator Approval</span>
            </p>
          </div>
          <p className="text-[11px] font-mono text-muted">
            An unapproved account cannot view or modify blood inventory or outage logs.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={handleSignOut}
              className="text-xs font-mono px-4 py-2 rounded border border-line text-muted hover:text-ink transition"
            >
              Sign out
            </button>
            <button
              onClick={() => loadUserProfile(session.user.id)}
              className="text-xs font-mono px-4 py-2 rounded bg-surface2 border border-line text-ink hover:border-safe transition"
            >
              Check status ↻
            </button>
          </div>
        </div>
      </main>
    );
  }

  // 4. APPROVED user (Staff or Admin)
  return (
    <main className="min-h-screen px-5 py-8 md:px-10 md:py-12 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between border-b hairline pb-6 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="font-mono text-xs tracking-widest text-muted uppercase">
              {isAdmin ? "Admin Console" : "Staff Console"}
            </p>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                isAdmin ? "bg-blood/20 text-blood" : "bg-safe/10 text-safe"
              }`}
            >
              {isAdmin ? "Admin Mode" : "Verified Staff"}
            </span>
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {isAdmin ? "Inventory Control" : assignedHospital?.name || "Inventory Control"}
          </h1>
          <p className="text-xs font-mono text-muted mt-1">
            Logged in as {profile.full_name || session.user.email}
            {assignedHospital && !isAdmin && ` · ${assignedHospital.state} State`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {queueLen > 0 ? (
            <button
              onClick={handleManualFlush}
              className="text-xs font-mono px-3 py-1.5 rounded border border-warn text-warn animate-pulse-ring"
            >
              {queueLen} unsynced — tap to retry
            </button>
          ) : (
            <span className="text-xs font-mono text-safe">● synced</span>
          )}
          <button
            onClick={handleSignOut}
            className="text-xs font-mono px-3 py-1.5 rounded border border-line text-muted hover:text-ink hover:border-muted transition"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Session Expired / Sync Alert */}
      {sessionExpiredAlert && (
        <div className="card p-3 mb-6 border border-warn text-warn text-xs font-mono flex items-center justify-between">
          <span>
            Session expired or unauthorized. Please sign out and sign in again to sync your offline changes ({queueLen} pending).
          </span>
          <button onClick={handleSignOut} className="underline ml-3 hover:text-ink">
            Sign in again
          </button>
        </div>
      )}

      {/* Hospital Selector: Visible ONLY for Admins. Hidden for standard staff */}
      {isAdmin ? (
        <div className="mb-8">
          <label className="text-xs font-mono text-muted block mb-1">
            Active Hospital (Admin Switcher):
          </label>
          <select
            value={hospitalId}
            onChange={(e) => setHospitalId(e.target.value)}
            className="bg-surface border hairline rounded px-3 py-2 text-ink w-full md:w-80 text-sm"
          >
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.state})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Cold-chain risk banner */}
      {ongoingOutage && (
        <div className={`card p-4 mb-8 border ${risk.atRisk ? "border-blood" : "border-warn"}`}>
          <p
            className="font-mono text-xs uppercase tracking-wide mb-1"
            style={{ color: risk.atRisk ? "#E4362E" : "#F0A93A" }}
          >
            {risk.atRisk ? "Cold-chain risk — spoilage possible" : "Power outage in progress"}
          </p>
          <p className="text-ink text-sm">
            Ongoing for {risk.hours}h{" "}
            {ongoingOutage.generator_backup ? "(generator backup active)" : "(no backup power)"}.
          </p>
          <button
            onClick={() => endOutage(ongoingOutage.id)}
            className="mt-2 text-xs font-mono underline text-muted hover:text-ink"
          >
            Mark power restored
          </button>
        </div>
      )}

      {!ongoingOutage && (
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => startOutage(false)}
            disabled={savingOutage}
            className="text-xs font-mono px-3 py-2 rounded border border-line text-muted hover:text-warn hover:border-warn transition"
          >
            Log power outage
          </button>
          <button
            onClick={() => startOutage(true)}
            disabled={savingOutage}
            className="text-xs font-mono px-3 py-2 rounded border border-line text-muted hover:text-safe hover:border-safe transition"
          >
            Log outage (generator on)
          </button>
        </div>
      )}

      {/* Add batch */}
      <form onSubmit={addBatch} className="card p-5 mb-8 flex flex-col md:flex-row gap-3 md:items-end">
        <div>
          <label className="text-xs font-mono text-muted block mb-1">Blood type</label>
          <select
            value={form.blood_type}
            onChange={(e) => setForm({ ...form, blood_type: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink"
          >
            {BLOOD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-mono text-muted block mb-1">Units</label>
          <input
            type="number"
            min="1"
            value={form.units_available}
            onChange={(e) => setForm({ ...form, units_available: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink w-24"
          />
        </div>
        <div>
          <label className="text-xs font-mono text-muted block mb-1">Batch expiry date</label>
          <input
            type="date"
            value={form.batch_expiry_date}
            onChange={(e) => setForm({ ...form, batch_expiry_date: e.target.value })}
            className="bg-surface2 border hairline rounded px-3 py-2 text-ink"
          />
        </div>
        <button
          type="submit"
          className="bg-blood text-white font-mono text-sm px-4 py-2 rounded hover:bg-blood-dim transition"
        >
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
                <button
                  onClick={() => adjustUnits(item, -1)}
                  className="w-7 h-7 rounded border hairline text-ink hover:border-blood"
                >
                  −
                </button>
                <span className="font-mono w-6 text-center text-ink">{item.units_available}</span>
                <button
                  onClick={() => adjustUnits(item, 1)}
                  className="w-7 h-7 rounded border hairline text-ink hover:border-safe"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
        {inventory.length === 0 && (
          <p className="text-muted text-sm font-mono">No batches logged yet for this facility.</p>
        )}
      </div>
    </main>
  );
}
