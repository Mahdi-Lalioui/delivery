import palettes from "@zaafran/tokens/palettes.json" with { type: "json" };

// DESIGN §6: original duotone line icons (ink + saffron) in a 24-unit box. They live here while
// the demo seed is their only user; they move to packages/ui when the M3 cuisine chips need them.
const ink = palettes.light.text;
const saffron = palettes.light.primary;
const line = (width = 1.6) =>
  `fill="none" stroke="${ink}" stroke-width="${width.toString()}" stroke-linecap="round"`;
const filled = `fill="${saffron}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"`;

const plate = [
  `<circle cx="12" cy="12" r="5" fill="${saffron}"/>`,
  `<circle cx="12" cy="12" r="8.5" ${line()}/>`,
].join("");

const icons: Readonly<Record<string, string>> = {
  // A tagine: cone lid on a shallow dish.
  algerian: [
    `<path d="M5 15.5 Q6 9.5 12 6 Q18 9.5 19 15.5 Z" ${filled}/>`,
    `<circle cx="12" cy="4.8" r="1.3" fill="${ink}"/>`,
    `<path d="M3 16.5 H21 Q20 20 12 20 Q4 20 3 16.5 Z" ${filled}/>`,
  ].join(""),
  // A skewer with three pieces.
  grill: [
    `<path d="M4 20 L20 4" ${line()}/>`,
    `<circle cx="8.5" cy="15.5" r="2.3" ${filled}/>`,
    `<circle cx="12" cy="12" r="2.3" ${filled}/>`,
    `<circle cx="15.5" cy="8.5" r="2.3" ${filled}/>`,
  ].join(""),
  // A slice with a thick crust.
  pizza: [
    `<path d="M12 21 L4.5 6.5 Q12 3 19.5 6.5 Z" ${filled}/>`,
    `<path d="M4 5.5 Q12 1.5 20 5.5" ${line(2.4)}/>`,
    `<circle cx="10.5" cy="9.5" r="1.3" fill="${ink}"/>`,
    `<circle cx="13.5" cy="12.5" r="1.1" fill="${ink}"/>`,
  ].join(""),
  // A burger: buns around a wavy leaf and a patty.
  "fast-food": [
    `<path d="M4 11 Q4 5 12 5 Q20 5 20 11 Z" ${filled}/>`,
    `<path d="M4 13 Q6 14.5 8 13 Q10 14.5 12 13 Q14 14.5 16 13 Q18 14.5 20 13" ${line()}/>`,
    `<path d="M4.5 16 H19.5" ${line(2.4)}/>`,
    `<path d="M5 18 H19 Q19 20.5 16.5 20.5 H7.5 Q5 20.5 5 18 Z" ${filled}/>`,
  ].join(""),
  // A fish facing the start edge.
  seafood: [
    `<path d="M3 12 Q9 5 16 12 Q9 19 3 12 Z" ${filled}/>`,
    `<path d="M16 12 L21 8 V16 Z" ${filled}/>`,
    `<circle cx="7" cy="11" r="1" fill="${ink}"/>`,
  ].join(""),
  // A cupcake with a cherry.
  pastry: [
    `<path d="M5 13 Q5 7.5 12 7 Q19 7.5 19 13 Z" ${filled}/>`,
    `<path d="M6 13 H18 L16.5 20 H7.5 Z M10 13 L10.5 20 M14 13 L13.5 20" ${line()}/>`,
    `<circle cx="12" cy="5" r="1.4" fill="${saffron}" stroke="${ink}" stroke-width="1.2"/>`,
  ].join(""),
};

/** The cuisine's icon as SVG markup in a 24×24 box, or a plate for cuisines without one. */
export function cuisineIcon(cuisine: string): string {
  return icons[cuisine] ?? plate;
}
