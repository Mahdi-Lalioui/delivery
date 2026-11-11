// The AWID logo and app icon are Mahdi's artwork, cut out of docs/brand/awid-reference.jpg by
// docs/brand/extract_brand_assets.py. They are shown as-is, never redrawn or recoloured.

const wordmark = { src: "/brand/awid-wordmark.png", width: 565, height: 228 };
const icon = { src: "/brand/awid-icon.png", width: 245, height: 250 };

/** Full logo (speed lines, courier "A", pin, WID). On dark surfaces it sits on a light plate. */
export function Logo({ height = 40, name }: { height?: number; name: string }) {
  const width = Math.round((wordmark.width / wordmark.height) * height);
  return (
    <span className="ui-logo-plate">
      <img
        className="ui-logo"
        src={wordmark.src}
        alt={name}
        width={width}
        height={height}
        decoding="async"
      />
    </span>
  );
}

/** The app icon (favicons, avatars, tight spaces). Decorative unless `label` is given. */
export function LogoMark({ size = 40, label }: { size?: number; label?: string }) {
  return (
    <img
      className="ui-logo ui-logo-icon"
      src={icon.src}
      alt={label ?? ""}
      width={size}
      height={Math.round((icon.height / icon.width) * size)}
      decoding="async"
    />
  );
}
