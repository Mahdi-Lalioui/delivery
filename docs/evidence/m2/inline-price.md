# M2 inline price editor evidence

The production `pnpm test:e2e:auth --fail-on-flaky-tests` suite passed all 11 Chromium journeys. The shared option journey confirmed that Escape cancels, a fractional price is rejected, and Enter saves 612 DZD. The response and subsequent reload preserved the item's other saved fields, including ordered attachments. Save and cancel both restored focus to Edit price.

The design critic approved 16 Arabic and French light and dark layout cases and four validation cases. The matrix included 390×844, 768×1024, 1280×800, and 360×844 at 200% text. No axe WCAG A or AA issues or horizontal overflow were detected. The currency suffix fit on one line and enabled controls met the 44×44 px target. Both locales verified focus restoration and exactly one successful keyboard write. [Lossless captures](inline-price/) · [Measurements](inline-price/design-report.json)
