import type { Metadata } from "next";

const iconV = "28";

export const metadata: Metadata = {
  icons: {
    icon: [
      {
        url: `/icons/mail/favicon-16x16.png?v=${iconV}`,
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: `/icons/mail/favicon-32x32.png?v=${iconV}`,
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: `/icons/mail/favicon.ico?v=${iconV}`,
        sizes: "16x16 32x32 48x48",
        type: "image/x-icon",
      },
    ],
    apple: [
      {
        url: `/icons/mail/apple-touch-icon.png?v=${iconV}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function MailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
