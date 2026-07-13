import "./globals.css";

export const metadata = {
  title: "句読点、",
  description: "抜けた句読点を正しい場所に打ち直す、原稿用紙パズル。",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
