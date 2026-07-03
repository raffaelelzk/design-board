# Changelog

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
