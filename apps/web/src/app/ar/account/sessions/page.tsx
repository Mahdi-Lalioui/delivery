import {
  DeviceSessionsPage,
  deviceSessionsMetadata,
} from "../../../../components/device-sessions-page";

export function generateMetadata() {
  return deviceSessionsMetadata("ar");
}

export default function ArabicDeviceSessions() {
  return <DeviceSessionsPage locale="ar" />;
}
