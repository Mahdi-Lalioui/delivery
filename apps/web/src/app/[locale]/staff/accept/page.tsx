import {
  StaffAcceptPage,
  staffAcceptMetadata,
} from "../../../../merchant-staff/components/staff-accept-page";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";

export async function generateMetadata(props: LatinPageProps) {
  return staffAcceptMetadata(await requireLatinLocale(props));
}

export default async function LatinStaffAccept(props: LatinPageProps) {
  return <StaffAcceptPage locale={await requireLatinLocale(props)} />;
}
