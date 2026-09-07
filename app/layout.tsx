import "@copilotkit/react-core/v2/styles.css";
import { getServerLocale } from "@/lib/i18n-server";
import { AppProviders } from "./locale-provider";
import "./globals.css";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getServerLocale();

  return (
    <html lang={locale}>
      <body>
        <AppProviders initialLocale={locale}>{children}</AppProviders>
      </body>
    </html>
  );
}
