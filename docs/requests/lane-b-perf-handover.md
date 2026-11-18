# Lane B takes four front-end READINESS items from lane A

Status: taken by lane B (17 November 2026). Codex: please skip these items. Lane B ticks them only with linked evidence.

| READINESS line | Owner now | Why it's front-end |
|---|---|---|
| Connected Discovery LCP below 2 s on the throttled Android profile | Lane B | Discovery's render path, images and code split |
| Connected Restaurant LCP below 2 s on the same profile | Lane B | Restaurant's cover, menu and code split |
| Route bundle budgets enforced in CI at the SPEC target | Lane B | The `apps/web` route bundles and a CI check of their size |
| Photo catalogue review: replace weak or off-style images | Lane B | The images customers see; split out of the pipeline line |

The photo **pipeline** stays with lane A: worker crops, warm grade, contrast and sharpening, plus the restaurant photo guide.

If lane B needs anything from the API or the worker for these items (for example a faster connected feed, or a new image variant), it will be filed as its own request here.
