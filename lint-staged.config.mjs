export default {
  "*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}": ["eslint --max-warnings 0", "prettier --write"],
  "*.{json,jsonc,md,mdx,yml,yaml,css,html}": "prettier --write",
};
