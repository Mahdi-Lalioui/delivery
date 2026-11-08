import { Button } from "@zaafran/ui";

const decreaseSymbol = "−";
const increaseSymbol = "+";

export function RestaurantQuantity({
  label,
  decreaseLabel,
  increaseLabel,
  quantity,
  onChange,
}: {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  return (
    <fieldset className="restaurant-quantity">
      <legend>{label}</legend>
      <Button
        variant="secondary"
        aria-label={decreaseLabel}
        disabled={quantity <= 1}
        onClick={() => {
          onChange(quantity - 1);
        }}
      >
        {decreaseSymbol}
      </Button>
      <output aria-label={label}>{quantity}</output>
      <Button
        variant="secondary"
        aria-label={increaseLabel}
        disabled={quantity >= 20}
        onClick={() => {
          onChange(quantity + 1);
        }}
      >
        {increaseSymbol}
      </Button>
    </fieldset>
  );
}
