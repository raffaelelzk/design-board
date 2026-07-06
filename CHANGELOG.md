# Changelog

## v3.4.0 — Optional Private Cloud Sharing

- Added optional Supabase anonymous authentication.
- Added private cloud project snapshots with owner-based RLS.
- Added short token links that do not contain project JSON or images.
- Added private Storage uploads for embedded images and attachments.
- Added automatic image downscaling and WebP compression before cloud upload.
- Added automatic cloud-link redemption and local-copy import.
- Kept all existing offline QR, share-code and `.ctbshare` workflows.
- Added a complete SQL setup file and step-by-step configuration guide.
- Cloud sharing remains disabled until `supabase-config.js` is configured.

## v3.3.2 — Homepage Card Spacing

- Increased the vertical spacing between card tags and the bottom action row.
- Converted tool cards to a flex-column layout so action buttons stay aligned.
- Increased desktop and mobile card heights to prevent cramped content.
- Kept the bottom actions in normal document flow instead of absolute positioning.

## v3.3.1 — Design Board View Isolation

- Fixed the Design Board dashboard reappearing above the project editor.
- Updated both loading fallback timers so they no longer reveal the dashboard while the editor is open.
- Clear pending loading fallback timers when entering a project.
- Made dashboard and editor visibility mutually exclusive during startup and recovery.
- Bumped the Design Board page cache version.

## v3.3.0 — Compact Project Header

- Replaced the always-visible project-name input with a clean text heading.
- The input field now appears only while renaming.
- Tightened title size, spacing, back-button alignment and action-button alignment.
- Added ellipsis handling for very long project names.
- Kept double-click, keyboard and rename-button access to editing.
- Applied the same header treatment to 排期规划 and 上线清单.

## v3.2.1 — Rename Input Fix

- Fixed project titles jumping to “未命名排期 / 未命名清单” while the user was deleting text.
- Project names are now committed only after pressing Enter, clicking “完成”, or leaving the field.
- Empty names stay in edit mode and show a validation message instead of inserting a default name during typing.
- Fixed the rename-button blur/click conflict.
- Shortened the homepage search placeholder to “搜索工具或标签” so it displays completely.

## v3.2.0 — Chinese UI & Safer Project Renaming

- Switched the remaining visible UI copy on the homepage and tool pages to Chinese.
- Added a dedicated “重命名” button for Timeline Planner and Launch Checklist project titles.
- Project titles are now read-only by default and can be edited only after clicking “重命名” or double-clicking the title.
- Prevented accidental caret / direct editing in the large workspace title.
- Kept Enter to confirm the new name and Escape to cancel the rename.
- Updated cache-busting versions for the three core tools.

## v3.1.0 — QR & Workspace Polish

- Added local QR-code sharing for projects that fit within a reliable QR capacity.
- Added share links that open the correct tool with the project ready to import.
- Added `.ctbshare` file export/import for larger projects, images and attachments.
- Kept the raw share code inside a collapsed fallback section.
- Removed the three explanatory pills below tool-page headings.
- Reworked child-project headings for a cleaner workspace appearance.

## v3.0.0 — Share Code & Visual Alignment

- Unified Design Board, Timeline Planner and Launch Checklist with the homepage visual language.
- Replaced JSON import as the main collaboration flow with copyable share codes.
- Added compressed `CTB1G.` share codes with a plain `CTB1.` fallback.
- Added one-click copy and paste-to-import flows without registration or login.
- Preserved Timeline Planner task dependencies during share-code import.
- Protected Launch Checklist private cost quotes by excluding them from share codes by default.
- Removed all remaining Supabase scripts, public Storage reads and anonymous cloud writes.
- Kept browser-local automatic saving with IndexedDB/localStorage fallback.
- Retained CSV and print/PDF output where useful.
