// DESIGN §7: numbers that change (cart total, ETA) roll like an odometer with tabular digits.
// Each digit column is positioned by a CSS attribute selector, so no inline styles are needed.

const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function OdometerNumber({ value }: { value: string }) {
  return (
    // Digits always run left to right, also inside Arabic text.
    <span className="odometer" dir="ltr" aria-label={value} role="text">
      {Array.from(value).map((character, index) =>
        /\d/.test(character) ? (
          <span key={index} className="odometer-digit" data-digit={character} aria-hidden="true">
            <span className="odometer-strip">
              {digits.map((digit) => (
                <span key={digit}>{digit}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={index} aria-hidden="true">
            {character}
          </span>
        ),
      )}
    </span>
  );
}
