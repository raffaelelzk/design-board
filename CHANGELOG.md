# Changelog

## v2.3.0 — Launch Checklist

- Added Launch Checklist as the third Creative Toolbox tool.
- Added independent multi-project product delivery checklists.
- Added product image compression and browser-local image storage.
- Added production status, supplier, MOQ, arrival date, dimensions, material, design notes, and sample notes.
- Added XS/155 through XXL/180 quantity matrix with automatic totals.
- Added automatic completeness scoring and delivery risk checks.
- Added a collapsed private cost quote field excluded from normal exports by default.
- Added JSON import/export, CSV export, and print/PDF reports.
- Preserved hidden `externalRefs` compatibility fields without visible tool linking.
- Updated the homepage tool count to three.

## v2.2.0 — Timeline Planner

- Added Timeline Planner as the second Creative Toolbox tool.
- Added schedule templates for cultural products, brand design, events, and blank projects.
- Added task list and horizontal timeline views.
- Added automatic risk detection for overdue dates, missing owners, invalid dates, and incomplete dependencies.
- Added local multi-project storage, JSON import/export, CSV export, and print/PDF output.
- Updated the homepage tool count and added the Timeline Planner card.

## v2.1.1 — Loading hotfix

- Fixed an infinite loading screen when IndexedDB is blocked or slow.
- Added a 3.5-second startup fail-safe.
- Added automatic fallback to localStorage.
- Embedded the runtime script into `design-board.html` to avoid a missing `app.js` request.
- Added cache busting to the homepage Design Board link.

## 2.0.0

### Added

- Local-first IndexedDB persistence
- Read-only demo project and copy-to-local flow
- Project and full-workspace JSON import/export
- Full-project version snapshots
- Local image and attachment storage
- Formal proposal preview and print/PDF layout
- Product pricing, cost, supplier, MOQ, delivery, risk, owner and next-action fields
- Mobile layout and save-state feedback

### Changed

- Reorganized the editor into four focused modules
- Split the original single HTML file into HTML, CSS and JavaScript
- Updated the dashboard to distinguish demo and local projects

### Removed

- Supabase dependency
- Shared public storage file
- Cloud-sync wording and anonymous cloud writes
- Login and registration requirements for the testing phase
