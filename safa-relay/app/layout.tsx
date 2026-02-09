import "./globals.css";

export const metadata = {
  title: "SAFA Relay v1",
  description: "Relay console for SAFA jobs, approvals, and results."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="app-title">SAFA Relay v1</div>
            <div className="app-subtitle">Vercel UI + API relay</div>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
