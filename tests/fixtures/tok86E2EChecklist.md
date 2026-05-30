# TOK-86 End-to-End Refactor Smoke Checklist

Scope: architecture refactor verification for UI/business separation after each slice. This checklist explicitly excludes structural `src/features/print/print.js` work and the unresolved TOK-72 print base highlight bug.

## 1. Search Plan Flow

- Open the normal search UI and the travel search UI.
- Select origin and destination with text search and station candidates.
- Compute at least one journey plan and page through rendered results.
- Hover or focus a plan row and confirm map preview appears, then clears.
- Confirm reachable-stops heatmap/overlay still updates when destination minutes change.

## 2. Panel Selection Flow

- Select a company, a line, and a station from the map or menu.
- Confirm the panel opens with the expected station/line context.
- Switch timetable day and timetable view mode.
- Use direction filter controls and confirm rows update without reopening the panel.
- Confirm long direction title marquee behavior is tested as part of panel UI work, not business logic.

## 3. Route-Map Flow

- Open the route-map panel from a selected line or panel action.
- Change branch/detail options when available.
- Hover route-map station rows and confirm station indicator show/clear behavior on the main map.
- Run route-map capture/export UI and confirm it completes without using `src/features/print/print.js`.

## 4. Multi-Select Layer Flow

- Enable multi-select mode through the existing UI.
- Confirm hover preview is disabled while multi-select is active and restored after exit.
- Confirm the multi-select layer list receives layer sync updates.
- Run remove and toggle-visibility commands for base and trip-preview layer items.
- Confirm legacy `mul-select.js` compatibility remains observable without structurally refactoring print.js.

## 5. Theme And Basemap Flow

- Switch appearance light, dark, and system modes.
- Switch basemap carto, ost, and transparent modes.
- Confirm the map does not require refresh, does not turn blank, and does not duplicate MapLibre instances.
- Confirm station/line colors and selection effects update after theme changes.

## 6. Architecture Gate Flow

- Run `npm test` after each refactor slice.
- If a UI file loses responsibilities, lower the matching budget in `tests/uiArchitectureBudgets.smoke.mjs`.
- Do not add `src/features/print/print.js` to UI/business architecture budgets during TOK-79/TOK-86.
- Do not retry TOK-72 dead-end print base highlight fixes in this architecture gate.
