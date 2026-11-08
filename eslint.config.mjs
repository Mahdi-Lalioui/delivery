import process from "node:process";
import { createEslintConfig } from "@zaafran/config/eslint";

export default createEslintConfig(process.cwd());
