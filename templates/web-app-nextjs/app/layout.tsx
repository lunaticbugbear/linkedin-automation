import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "{{PROJECT_NAME}}",
  description: "{{PROJECT_DESCRIPTION}}",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
