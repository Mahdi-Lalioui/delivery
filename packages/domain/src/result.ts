export type Result<Value, Error extends { readonly code: string }> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: Error };

export function fail<Code extends string>(code: Code): { ok: false; error: { code: Code } } {
  return { ok: false, error: { code } };
}
