import "./globals.css";

const SITE_URL = "https://kutoten-orpin.vercel.app";
const TITLE = "句読点、";
const DESC = "句読点ひとつで、意味は変わる。抜けた「、」や「。」を原稿用紙のマスに打ち直す日本語パズル。答え合わせは朱入れ。なぜその句読点なのかの解説つき。";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESC,
  keywords: ["句読点", "日本語", "パズル", "ゲーム", "国語", "読点", "校正", "原稿用紙"],
  openGraph: {
    title: TITLE,
    description: DESC,
    url: SITE_URL,
    siteName: TITLE,
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
  },
  robots: { index: true, follow: true },
  verification: {
    google: "I6ffD0lbvZUruWik4PIhOER00Txd0QxRKAH4FpPcUDM",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f7f4ea",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
