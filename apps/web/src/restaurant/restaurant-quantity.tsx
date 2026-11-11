import { Icon } from "@zaafran/ui";

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
      <div className="restaurant-stepper">
        <button
          type="button"
          aria-label={decreaseLabel}
          disabled={quantity <= 1}
          onClick={() => {
            onChange(quantity - 1);
          }}
        >
          <Icon name="minus" size={20} />
        </button>
        <output aria-label={label} key={quantity}>
          {quantity}
        </output>
        <button
          type="button"
          aria-label={increaseLabel}
          disabled={quantity >= 20}
          onClick={() => {
            onChange(quantity + 1);
          }}
        >
          <Icon name="plus" size={20} />
        </button>
      </div>
    </fieldset>
  );
}
