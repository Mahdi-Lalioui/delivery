// The AWID logo and app icon are SVGs redrawn from docs/brand/awid-reference.jpg
// (traced in flat brand layers with imagetracerjs, then cleaned). Each has a variant for dark surfaces;
// CSS shows the one that matches the theme.

const wordmark = {
  light: "/brand/awid-logo.svg",
  dark: "/brand/awid-logo-dark.svg",
  ratio: 600 / 248,
};
const icon = { light: "/brand/awid-icon.svg", dark: "/brand/awid-icon-dark.svg" };

/** Full logo (speed lines, courier "A", pin, WID). */
export function Logo({ height = 40, name }: { height?: number; name: string }) {
  const width = Math.round(wordmark.ratio * height);
  return (
    <span className="ui-logo-pair" role="img" aria-label={name}>
      <img
        className="ui-logo ui-logo-light"
        src={wordmark.light}
        alt=""
        width={width}
        height={height}
      />
      <img
        className="ui-logo ui-logo-dark"
        src={wordmark.dark}
        alt=""
        width={width}
        height={height}
      />
    </span>
  );
}

/** The app icon (favicons, avatars, tight spaces). Decorative unless `label` is given. */
export function LogoMark({ size = 40, label }: { size?: number; label?: string }) {
  const name = label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label };
  return (
    <span className="ui-logo-pair" {...name}>
      <img className="ui-logo ui-logo-light" src={icon.light} alt="" width={size} height={size} />
      <img className="ui-logo ui-logo-dark" src={icon.dark} alt="" width={size} height={size} />
    </span>
  );
}
