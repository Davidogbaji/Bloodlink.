import { expiryStatus } from "../lib/utils";

const COLOR_MAP = {
  safe: "#2BB673",
  warning: "#F0A93A",
  critical: "#E4362E",
  expired: "#7A2620",
};

// A heartbeat-monitor-style radial ring: sweep fraction = days left / 42
// (max shelf life), color-coded. This is the page's signature visual —
// staff can scan a room of cards and read risk from color/fill alone.
export default function ExpiryRing({ expiryDate, size = 64, label }) {
  const { daysLeft, level } = expiryStatus(expiryDate);
  const fraction = Math.max(0, Math.min(1, daysLeft / 42));
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);
  const color = COLOR_MAP[level];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="expiry-ring">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#24344D"
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center leading-none">
        <span className="font-mono text-[11px] font-medium" style={{ color }}>
          {level === "expired" ? "0" : daysLeft}
        </span>
        {label && <span className="text-[8px] text-muted mt-0.5">{label}</span>}
      </div>
    </div>
  );
}
