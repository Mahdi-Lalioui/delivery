import {
  DeviceSessionsPage,
  deviceSessionsMetadata,
} from "../../../../components/device-sessions-page";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";

export async function generateMetadata(props: LatinPageProps) {
  return deviceSessionsMetadata(await requireLatinLocale(props));
}

export default async function LatinDeviceSessions(props: LatinPageProps) {
  return <DeviceSessionsPage locale={await requireLatinLocale(props)} />;
}
