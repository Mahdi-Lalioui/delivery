# Tagine rebuild: design loop (2026-11-12)

Frames at 0, 450, 1100 and 1700 ms (closed, lid rising, steam, settled), 288 px, rendered by
`createTagineScene(...).render(ms)`.

Mahdi's review: lid read as a pointed hat; base flat; crude.

| Round | Flaw found | Fix |
|---|---|---|
| 1 | Food tokens read empty (cached stylesheet), so no pattern or garnish; lid still conical; base band hidden; white steam invisible on pale bg | cache-busted tokens; bell-shaped lid (shoulder exponent 0.42); steam gradient gets a faint `--color-text-3` edge |
| 2 | Carrots and chickpeas buried in the couscous; base too shallow | garnish placed on the mound surface (`onMound`); deeper base |
| 3 | Base pattern band faces away from the light | zellige ring moved onto the flat rim top, facing the camera; camera lowered |
| 4 (dark) | Steam and chickpeas took the dark surface colour and read as smoke | new theme-invariant `--color-food-steam` token |

Final: domed glazed lid with saffron rim band, zellige star band and turned knob; glazed clay
base with an upright rim and matching zellige ring; couscous with meat, carrot spears and
chickpeas; warm key, sky fill and copper rim lights; soft PCF contact shadow; swaying soft-sprite
steam. Reduced motion and missing WebGL still fall back to the SVG moment.
