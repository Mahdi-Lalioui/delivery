import {
  StaffAcceptPage,
  staffAcceptMetadata,
} from "../../../../merchant-staff/components/staff-accept-page";

export function generateMetadata() {
  return staffAcceptMetadata("ar");
}

export default function ArabicStaffAccept() {
  return <StaffAcceptPage locale="ar" />;
}
