import "./globals.css";

export const metadata = {
  title: "Soubory ke stazeni",
  description: "Jednoduche sdileni souboru pres Vercel Blob",
};

export default function RootLayout({ children }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
