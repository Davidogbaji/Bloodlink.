// Nigerian states, used for state-based filtering (how blood banks actually
// coordinate on the ground — LGA/state, not GPS radius).
export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
  "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

export const BLOOD_TYPES = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];

// Haversine formula — pure client-side distance, no Maps API / no cost.
export function distanceKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v === null || v === undefined)) {
    return null;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Blood shelf life is 35-42 days depending on anticoagulant/storage method.
// We treat batch_expiry_date as authoritative and just compute countdown state.
export function expiryStatus(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr);
  const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return { daysLeft, level: "expired", color: "blood" };
  if (daysLeft <= 3) return { daysLeft, level: "critical", color: "blood" };
  if (daysLeft <= 10) return { daysLeft, level: "warning", color: "warn" };
  return { daysLeft, level: "safe", color: "safe" };
}

// Cold-chain risk: an outage with no generator backup running longer than
// this many hours is considered a spoilage risk for refrigerated units.
export const COLD_CHAIN_RISK_HOURS = 4;

export function outageRisk(outage) {
  if (outage.generator_backup) return { atRisk: false, hours: 0 };
  const start = new Date(outage.start_time);
  const end = outage.end_time ? new Date(outage.end_time) : new Date();
  const hours = (end - start) / (1000 * 60 * 60);
  return { atRisk: hours >= COLD_CHAIN_RISK_HOURS, hours: Math.round(hours * 10) / 10 };
}

// WhatsApp click-to-chat — free, no API key, works on any phone with WhatsApp.
export function whatsAppLink(phone, message) {
  const clean = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}
