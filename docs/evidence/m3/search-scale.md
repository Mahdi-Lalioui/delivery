# SRCH-06 search scale

- Corpus: 500 synthetic active restaurants, 30,000 items and 22 golden queries with production synonym groups.
- Red: PostgreSQL canceled a search at the 500 ms statement deadline.
- Green: fresh index p95 was 65.5 ms against a 120 ms limit. All 22 queries found their dish in the top three and all 12 focused search tests passed.
- Reproduce with `pnpm test:int packages/db/test/discovery-search-scale.integration.test.ts packages/db/test/discovery-search.integration.test.ts`.
