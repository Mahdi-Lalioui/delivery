import { flyToCart } from "../marketing/moments/fly-to-cart";

export function captureCartPhoto(): HTMLImageElement | undefined {
  const source = document.querySelector<HTMLImageElement>(
    "dialog[open] .restaurant-dish-photo img",
  );
  if (!source?.naturalWidth) return undefined;
  const rect = source.getBoundingClientRect();
  const thumbnail = document.createElement("img");
  thumbnail.src = source.currentSrc;
  thumbnail.alt = "";
  thumbnail.className = "demo-cart-flight";
  thumbnail.style.left = `${String(rect.left + rect.width / 2 - 28)}px`;
  thumbnail.style.top = `${String(rect.top + rect.height / 2 - 28)}px`;
  return thumbnail;
}

export function playCartPhoto(thumbnail: HTMLImageElement) {
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(".restaurant-cart-button");
    if (!target) return;
    document.body.append(thumbnail);
    void flyToCart(thumbnail, target).then(
      () => {
        thumbnail.remove();
      },
      () => {
        thumbnail.remove();
      },
    );
  });
}
