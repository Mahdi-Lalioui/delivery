import { mkdir, writeFile } from "node:fs/promises";
import { renderTheme } from "../src/theme.ts";

const output = new URL("../dist/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL("theme.css", output), renderTheme());
