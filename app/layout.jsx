import "./globals.css";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

export const metadata = {
  title: "BloodLink ColdChain",
  description: "Real-time blood inventory + cold-chain risk network for Nigerian hospitals",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body min-h-screen">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
