import { z } from "zod";

// Browser validation runs under a CSP that disallows dynamic code generation.
if ("document" in globalThis) z.config({ jitless: true });

export { z };
