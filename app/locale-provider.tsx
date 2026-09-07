"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { enUS } from "@clerk/localizations/en-US";
import { ruRU } from "@clerk/localizations/ru-RU";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  startTransition,
  useContext,
  useState,
} from "react";
import {
  APP_LOCALE_COOKIE,
  getDictionary,
  type AppLocale,
} from "@/lib/i18n";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale,
}: Readonly<{ children: ReactNode; initialLocale: AppLocale }>) {
  const [locale, setLocale] = useState(initialLocale);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function AppProviders({
  children,
  initialLocale,
}: Readonly<{ children: ReactNode; initialLocale: AppLocale }>) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <LocalizedClerkProvider>{children}</LocalizedClerkProvider>
    </LocaleProvider>
  );
}

function LocalizedClerkProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { locale } = useAppLocale();

  return (
    <ClerkProvider
      afterSignOutUrl="/"
      localization={locale === "ru" ? ruRU : enUS}
    >
      <LanguageSwitcher />
      {children}
    </ClerkProvider>
  );
}

export function useAppLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useAppLocale must be used inside LocaleProvider.");
  }
  return {
    ...context,
    dictionary: getDictionary(context.locale),
  };
}

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, setLocale, dictionary } = useAppLocale();

  function selectLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) return;
    document.cookie = `${APP_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = nextLocale;
    setLocale(nextLocale);
    startTransition(() => router.refresh());
  }

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={dictionary.common.languageSwitcher}
    >
      <button
        type="button"
        aria-pressed={locale === "ru"}
        title={dictionary.common.russian}
        onClick={() => selectLocale("ru")}
      >
        RU
      </button>
      <button
        type="button"
        aria-pressed={locale === "en"}
        title={dictionary.common.english}
        onClick={() => selectLocale("en")}
      >
        EN
      </button>
    </div>
  );
}
