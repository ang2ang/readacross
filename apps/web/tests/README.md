# Web reading checks

No additional production or test dependencies are required. Use Node 20+ and the existing workspace TypeScript package.

## Automated checks

```sh
node --test apps/web/tests/reading.test.cjs
pnpm --filter @readacross/web build
pnpm --filter @readacross/web lint
```

The Node checks cover file fingerprints, complete-match cache keys, retention boundaries (10 days / 5 originals / 100 MiB), source ordering, sidebar bounds, PDF zoom/viewport anchors, document isolation, stale async completions, deletion, unavailable storage, failed commits, temporary source jumps, and generation metadata in Markdown.

## Native IndexedDB

Start Vite, then open `http://localhost:5187/tests/browser.html` on a **disposable local origin**:

```sh
pnpm --filter @readacross/web dev --host 127.0.0.1 --port 5187
```

Click **Run storage checks**. The runner refuses to run if existing reading records are present. It uses the production storage module with native IndexedDB and removes only records it creates. It verifies Blob round trips, completed translation restoration, original eviction, expiry, oversize input, simulated quota and write failures, atomic rollback, and deleted-record protection. It makes no model requests.

## Reading interactions with a mock model

```sh
node apps/web/tests/mock-model.cjs
```

Use another fresh origin, for example `http://127.0.0.1:5187/`. In Settings choose Local LLM and set Base URL to `http://127.0.0.1:5189/v1`. The mock returns fixed text after a delay. For streamed output choose OpenAI with the same base URL and an arbitrary **test-only** key. Never use a real provider/key in these checks. Request count is available at `http://127.0.0.1:5189/count` and `/private/tmp/readacross-mock-count.json`.

Upload fixtures from `apps/web/tests/fixtures/`:

- `reading.pdf`: three pages with selectable text.
- `reading.epub`: two chapters with enough content to paginate.
- `ocr.png`: a simple English image for the existing OCR flow (language data may need network access).
- `linked.pdf`: direct/named destinations, return links, a missing name with a unique page label, an unresolved target, and an external URL.
- `navigation.epub`: long chapters, encoded paths, four TOC levels, deep anchors and an unavailable section.

Verify:

1. Opening, paging, changing font/width, collapsing and restoring the sidebar make no model requests.
2. Explicit translation makes one request; repeating a complete match reuses the result. A changed scope, original or generation configuration must miss.
3. Scroll up while a stream is in progress: the current scroll position stays fixed and **New translation** returns to the bottom.
4. Stop or leave the document during a request: unfinished output is neither persisted nor exported, and callbacks do not appear in a later document.
5. Reload, Continue, and reselect a renamed copy: completed translations, source position and font size recover. Existing output remains readable without an API key.
6. Select source text, translate, change width/font, locate it, and return. Hover/focus does not scroll. Whole-view results navigate to a page/range only. Exiting during a temporary source jump resumes the earlier position.
7. Export menu supports arrows, Escape, outside clicks, copying and downloading Markdown. Files contain full completed entries, source locations and the settings used to generate them.
8. Recent reading has at most five rows. Per-item removal and Settings clear require confirmation. Missing originals request the matching file; a different file is rejected without replacing the record.
9. Paste text and upload an image; their existing automatic translation/OCR flow remains available.

`/tests/responsive.html` embeds the actual app and provides 1280 / 1024 / 390px buttons. This is useful where the browser's outer window cannot be resized. At 1024px the source keeps at least 480px; at 390px the sidebar becomes a drawer and the page does not overflow horizontally.

## Verification recorded for this change

- 32 Node checks passed; Web build and full Web lint passed.
- All 19 native IndexedDB checks passed in the browser, including queued restore reads and deletion generations across old callbacks.
- PDF / EPUB restore, selection capture, width/font reflow, source navigation/return, copy/download, stopped requests, streamed scrolling, paste flow and responsive layouts were exercised with the local mock.
- The initial repository lint baseline had 13 errors and 3 warnings. The follow-up audit also resolved the remaining prompt editor state/effect problems and replaced the unused empty proxy environment interface with an equivalent type alias. Full Web lint now passes.

These HTML runners are development test entries, not additional production pages; Vite's normal build still has only `index.html` as its entry.

See [the plan audit](PLAN-AUDIT.md) for the follow-up fixes and evidence.

Markdown export checks use the real Web serializer, without stubbing the shared Obsidian exporter. Verify that each complete translation occurs exactly once in source order, the body keeps Markdown indentation/lists/tables/code, and the details at the end use the saved generation settings and source ranges. Raw originals, complete prompts, Obsidian snapshots/backlinks and records from other documents must not be inserted. Partial/incomplete drafts remain excluded. With existing PDF/EPUB test translations, actually download the `.md`, read the whole file, and compare **Copy Markdown** byte-for-byte with the downloaded file; restore the previous clipboard afterwards. Downloads use `<source name>.translated.md`.

PDF zoom regression: manual 130% must render at 1040px regardless of sidebar width, using the previous 800px baseline. **Fit width** is a separate saved mode, and its percentage reflects the actual page width. Verify viewport-center preservation when zooming/panning, reopening the sidebar, switching 1280 / 1024 / 390px, and restoring after a reload. A fully visible page retains its earlier reading anchor when returning to a wider screen. These actions must make no model requests.

PDF link regression: open `/tests/pdf-links.html` on a disposable origin and click **Run PDF link checks**. It mounts the actual reader and checks direct/named destinations, return links, page-label fallback, unresolved-target feedback, and the external URL without opening that URL. All eight assertions must pass. Also verify Enter on a named link while the sidebar is open at 130%: the page changes to 3 and the zoom stays fixed. The runner makes no model requests and adds no build entry or test dependency. The Node tests require a real, unique embedded page label for missing `page<label>` names; they reject absent/duplicate labels and give defined destinations priority.

EPUB navigation regression: open `/tests/epub-navigation.html` on a disposable origin and click **Run EPUB navigation checks**. It mounts the actual reader with `navigation.epub` and checks actual target visibility after reflow, rather than just the current chapter title. All 22 checks must pass: 100% / 130% / 70% TOC jumps, encoded paths, nested/deep anchors, translation sidebar open/closed, next/previous, TOC open/close, source locate/return, superseded navigation, unavailable-target feedback, and reopening at the saved 130% position. It also checks that the font override has applied; WebKit's user minimum font size is allowed. No model requests are made. The original reported book was additionally verified at 100% and 130%, including reload/Continue and subsequent TOC navigation.

The native runner also provides **Prepare locator fallback fixtures**. It adds deliberately mismatched selection records to the two repository fixtures on the disposable origin. Open them in the actual app: Locate must show a page/section notice and no inaccurate highlight, Return must restore the previous position, and neither operation should increase the mock request count.

## Changed Web files

- Reader UI: `ReaderLayout.tsx`, `PDFViewer.tsx`, `EpubViewer.tsx`, new `TranslationShell.tsx`.
- Translation UI: `TranslationPanel.tsx`.
- Upload/home UI: `FileUploader.tsx`, new `RecentReading.tsx`.
- Settings UI: `SettingsModal.tsx`, new `ReadingStorageSettings.tsx`; shared confirmation: new `common/ConfirmDialog.tsx`; modal coordination: `common/QuickPasteModal.tsx`.
- State: `useFileStore.ts`, new `useReadingStore.ts`.
- New internal modules: `reading/types.ts`, `policy.ts`, `storage.ts`, `markdown.ts`, `pdf-layout.ts`, `pdf-links.ts`.
- Existing proxy type-only lint cleanup: `functions/api/ollama/[[path]].ts` (no runtime or API behavior change).
- Tests: this directory's Node loader/checks, native browser and reading runners, mock server and small PDF/EPUB/image fixtures.

No production dependency, shared core API, extension, deployment or CI change was introduced by this work. Existing extension changes in the workspace were left untouched.
