import { merchantOnboardingOutput } from "@zaafran/contracts/merchant";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import { MerchantOnboardingScreen } from "./merchant-onboarding-screen";
import "./merchant-onboarding.css";

export interface MerchantSetupRouteProps {
  params: Promise<{ merchantId: string }>;
}

export async function requireSetupMerchantId({ params }: MerchantSetupRouteProps): Promise<string> {
  const { merchantId } = await params;
  const id = merchantOnboardingOutput.shape.merchantId.safeParse(merchantId);
  if (!id.success) notFound();

  return id.data.toLowerCase();
}

export async function merchantOnboardingMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "merchantOnboarding" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function MerchantOnboardingPage({
  merchantId,
  locale,
}: {
  merchantId: string;
  locale: Locale;
}) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/setup`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ merchantOnboarding: getMessages(locale).merchantOnboarding }}
      >
        <MerchantOnboardingScreen key={merchantId} merchantId={merchantId} locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
