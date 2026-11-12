import type { Sharp } from "sharp";

/** AWID's food grade. Keep whites near neutral and sharpen texture without hard halos. */
export function gradeFoodPhoto(image: Sharp): Sharp {
  return image.linear([1.05, 1.025, 0.99], [-3, -3, -4]).sharpen({ sigma: 0.65 });
}
