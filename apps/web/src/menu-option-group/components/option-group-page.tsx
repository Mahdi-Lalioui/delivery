import { merchantApplicationOutput } from "@zaafran/contracts/merchant";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import { OptionGroupScreen } from "./option-group-screen";
import "./option-group.css";

export interface OptionGroupRouteProps {
  params: Promise<{ merchantId: string }>;
}

export async function requireOptionGroupMerchant({ params }: OptionGroupRouteProps) {
  const { merchantId } = await params;
  const result = merchantApplicationOutput.shape.merchantId.safeParse(merchantId);
  if (!result.success) notFound();
  return result.data.toLowerCase();
}

export async function optionGroupMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "menuOptionGroup" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function OptionGroupPage({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/menu/options`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ menuOptionGroup: getMessages(locale).menuOptionGroup }}
      >
        <OptionGroupScreen key={merchantId} merchantId={merchantId} locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
