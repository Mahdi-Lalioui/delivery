import { useTranslations } from "next-intl";
import type { Job } from "./courier-http";

export function CourierNavigation({ pin }: { pin: Job["dropoff"]["pin"] }) {
  const t = useTranslations("courier");
  const coordinates = String(pin.latitude) + "," + String(pin.longitude);
  const links = [
    [
      "Google Maps",
      "https://www.google.com/maps/dir/?" +
        new URLSearchParams({ api: "1", destination: coordinates }).toString(),
    ],
    [
      "Waze",
      "https://www.waze.com/ul?" +
        new URLSearchParams({ ll: coordinates, navigate: "yes" }).toString(),
    ],
    [
      "Apple Maps",
      "https://maps.apple.com/?" + new URLSearchParams({ daddr: coordinates }).toString(),
    ],
  ];
  return (
    <nav className="courier-navigation" aria-label={t("navigation")}>
      {links.map(([label, href]) => (
        <a
          key={label}
          className="ui-button ui-button-secondary ui-button-md"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
