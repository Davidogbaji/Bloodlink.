-- =========================================================
-- BloodLink ColdChain — Staff Auth & Row Level Security Migration
-- Migration: 20261113_staff_auth.sql
-- 
-- Safe and additive: No table drops, no data loss.
-- Safe to run in Supabase SQL Editor.
-- =========================================================

-- 1. Create PROFILES table linked to Supabase auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin')),
    approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for fast hospital and authorization lookups
CREATE INDEX IF NOT EXISTS idx_profiles_hospital_id ON public.profiles(hospital_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_approved ON public.profiles(role, approved);

-- 2. Timestamp trigger function for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. Automatic Profile Creation Trigger on auth.users sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    h_id UUID;
    raw_h_id TEXT;
BEGIN
    raw_h_id := NEW.raw_user_meta_data->>'hospital_id';
    IF raw_h_id IS NOT NULL AND raw_h_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        h_id := raw_h_id::UUID;
    ELSE
        h_id := NULL;
    END IF;

    INSERT INTO public.profiles (id, full_name, hospital_id, role, approved)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Staff Member'),
        h_id,
        'staff',
        FALSE
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Helper Security Definer Functions for Row Level Security
-- Check if current authenticated user is an approved admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND approved = TRUE
    );
$$;

-- Check if current authenticated user is approved for target hospital (or is admin)
CREATE OR REPLACE FUNCTION public.is_approved_staff_for_hospital(target_hospital_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND approved = TRUE
          AND (role = 'admin' OR hospital_id = target_hospital_id)
    );
$$;

-- 5. Hardened Row Level Security (RLS)

-- 5A. PROFILES table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users view own profile" ON public.profiles;
CREATE POLICY "users view own profile" ON public.profiles
    FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "users insert own profile" ON public.profiles;
CREATE POLICY "users insert own profile" ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id AND approved = FALSE AND role = 'staff');

DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND role = 'staff'
        AND approved = (SELECT p.approved FROM public.profiles p WHERE p.id = auth.uid())
    );

DROP POLICY IF EXISTS "admins manage profiles" ON public.profiles;
CREATE POLICY "admins manage profiles" ON public.profiles
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5B. HOSPITALS table
-- Public can SELECT for public dashboard and registration dropdown
-- Admin only can INSERT/UPDATE/DELETE
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public write hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "public update hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "public delete hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "public read hospitals" ON public.hospitals;

CREATE POLICY "public read hospitals" ON public.hospitals
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin insert hospitals" ON public.hospitals;
CREATE POLICY "admin insert hospitals" ON public.hospitals
    FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin update hospitals" ON public.hospitals;
CREATE POLICY "admin update hospitals" ON public.hospitals
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin delete hospitals" ON public.hospitals;
CREATE POLICY "admin delete hospitals" ON public.hospitals
    FOR DELETE USING (public.is_admin());

-- 5C. BLOOD_INVENTORY table
-- Public can SELECT for public dashboard
-- Approved staff of matching hospital or Admin can INSERT/UPDATE/DELETE
ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public write inventory" ON public.blood_inventory;
DROP POLICY IF EXISTS "public update inventory" ON public.blood_inventory;
DROP POLICY IF EXISTS "public delete inventory" ON public.blood_inventory;
DROP POLICY IF EXISTS "public read inventory" ON public.blood_inventory;

CREATE POLICY "public read inventory" ON public.blood_inventory
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "staff insert inventory" ON public.blood_inventory;
CREATE POLICY "staff insert inventory" ON public.blood_inventory
    FOR INSERT
    WITH CHECK (public.is_approved_staff_for_hospital(hospital_id));

DROP POLICY IF EXISTS "staff update inventory" ON public.blood_inventory;
CREATE POLICY "staff update inventory" ON public.blood_inventory
    FOR UPDATE
    USING (public.is_approved_staff_for_hospital(hospital_id))
    WITH CHECK (public.is_approved_staff_for_hospital(hospital_id));

DROP POLICY IF EXISTS "staff delete inventory" ON public.blood_inventory;
CREATE POLICY "staff delete inventory" ON public.blood_inventory
    FOR DELETE
    USING (public.is_approved_staff_for_hospital(hospital_id));

-- 5D. OUTAGE_LOGS table
-- Public can SELECT for status tracking
-- Approved staff of matching hospital or Admin can INSERT/UPDATE/DELETE
ALTER TABLE public.outage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public write outages" ON public.outage_logs;
DROP POLICY IF EXISTS "public update outages" ON public.outage_logs;
DROP POLICY IF EXISTS "public read outages" ON public.outage_logs;

CREATE POLICY "public read outages" ON public.outage_logs
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "staff insert outages" ON public.outage_logs;
CREATE POLICY "staff insert outages" ON public.outage_logs
    FOR INSERT
    WITH CHECK (public.is_approved_staff_for_hospital(hospital_id));

DROP POLICY IF EXISTS "staff update outages" ON public.outage_logs;
CREATE POLICY "staff update outages" ON public.outage_logs
    FOR UPDATE
    USING (public.is_approved_staff_for_hospital(hospital_id))
    WITH CHECK (public.is_approved_staff_for_hospital(hospital_id));

DROP POLICY IF EXISTS "staff delete outages" ON public.outage_logs;
CREATE POLICY "staff delete outages" ON public.outage_logs
    FOR DELETE
    USING (public.is_approved_staff_for_hospital(hospital_id));

-- 5E. DONORS table
-- Public can INSERT to register as a donor.
-- SELECT access is restricted to approved staff/admins to prevent harvesting of donor phone numbers.
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public write donors" ON public.donors;
DROP POLICY IF EXISTS "public register donors" ON public.donors;
CREATE POLICY "public register donors" ON public.donors
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "public read donors" ON public.donors;
DROP POLICY IF EXISTS "staff read donors" ON public.donors;
CREATE POLICY "staff read donors" ON public.donors
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND approved = TRUE
        )
    );
