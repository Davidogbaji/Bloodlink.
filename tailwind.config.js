/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0A1628",
        surface: "#101F35",
        surface2: "#152743",
        line: "#24344D",
        ink: "#E8EDF4",
        muted: "#8CA0BC",
        blood: "#E4362E",
        "blood-dim": "#7A2620",
        safe: "#2BB673",
        warn: "#F0A93A",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        pulse: "0 0 0 0 rgba(228,54,46,0.6)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(228,54,46,0.55)" },
          "70%": { boxShadow: "0 0 0 14px rgba(228,54,46,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(228,54,46,0)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2.2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};
