# 日期时间合并控件 Design QA

- Source visual: `/Users/blysh/.codex/generated_images/01a04d7f-d830-7c32-8034-8006b3019f8a/exec-e8fb1946-854e-47d7-987c-9595c913888f.png`
- Implementation screenshot: `/private/tmp/tokyorailmap-picker-mobile-light-restdays-close.jpg`
- Side-by-side comparison: `/private/tmp/tokyorailmap-picker-comparison-restdays-close.png`
- Mobile viewport: 390 × 844 CSS pixels, device scale factor 1
- Desktop viewport: 1280 × 800 CSS pixels, device scale factor 1
- Verified state: light and dark themes; picker opened from both date and time; settings drawer visible behind the picker for z-axis verification

## Comparison

- Layout: the picker remains a floating popover anchored 10px below the top date/time capsule. At 390 × 844 it is 370 × 629px, with all four corners visible and no bottom-sheet geometry. The larger width and height are intentional user-requested changes from the selected concept.
- Content: the implementation starts directly with month navigation. It does not render the removed “选择日期与时间” heading or the removed current date/time summary row.
- Service-day labels: every visible Saturday, Sunday, or Japanese holiday date carries a persistent “休息日” label; ordinary non-selected labels sit adjacent to the date, while today and the selected date use the lower offset for visual emphasis.
- Hierarchy: calendar, time wheels, and the `恢复现在 / 取消 / 确定` footer retain the selected concept’s order and grouping. Date and time use the same dialog instance.
- Shape and surface: 18px frosted card, fine token border, 12px blur, and elevated shadow match the existing application surfaces. The pointer and right edge align to the capsule.
- Typography and spacing: application typography and real production density are retained; month, selected day, selected time, and actions have clear hierarchy without clipping at mobile or desktop sizes.
- Colors: all text, surface, border, active, hover, and dark-mode colors use existing `--ui-*` tokens. Selected date and primary actions use the existing `#3498DB` accent.
- Icons: month navigation uses the existing `assets/icons/arrow-right.svg` asset, including the rotated previous-month instance; no placeholder icon asset is used.
- Layering: backdrop `11000`, picker `11010`, and active capsule `11020` render above business drawers/popovers (highest existing business popover `10030`) and below global About/startup modal overlays (`12000`). The mobile screenshot confirms the picker visibly covers the open settings drawer.
- Behavior: draft edits do not apply on cancel; confirm applies date and time atomically; reset restores automatic current date/time; Escape and Android back close the picker first; the read-only time field avoids the mobile keyboard and native system picker.
- Accessibility: dialog semantics, labelled triggers, `aria-haspopup`, synchronized `aria-expanded`, selected states, keyboard open/close, focus restoration, and 44px action targets are present.

## History

1. Pass 1 — 390 × 844 dark theme: confirmed 370 × 629px anchored geometry, complete content, no clipping, dark tokens, and `z-index: 11010`.
2. Pass 2 — 390 × 844 light theme with settings drawer open: confirmed the requested removed copy is absent, the picker is above the drawer, and the side-by-side reference comparison preserves the intended component hierarchy while applying the requested larger dimensions.
3. Pass 3 — 1280 × 800 desktop: confirmed 540px width, capsule-right alignment, complete calendar/time/footer content, and no overlap or viewport overflow.
4. Pass 4 — 390 × 667 short mobile viewport: confirmed the compact-height rules preserve the complete calendar, time wheels, reset, cancel, and confirm actions without converting the component into a drawer.
5. Interaction pass: verified date and time triggers share one dialog; cancel preserves `08月29日 21:31`; confirm applies `08月30日 22:32`; Escape closes and clears `aria-expanded`.
6. Pass 5 — 390 × 844 light theme after spacing refinement: confirmed ordinary non-selected holiday labels sit close to their date numbers, today `30` keeps the same lower offset as a selected date, and the complete footer remains visible.

## Final Result

passed
