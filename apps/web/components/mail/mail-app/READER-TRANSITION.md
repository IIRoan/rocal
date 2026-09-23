# Desktop mail reader transition

How the desktop reader pane opens and closes next to the message list, and why it is built this way. Read this before touching the list/reader layout or its motion. Most of the rules exist because an earlier version stuttered in Firefox on Linux.

## Files

| File | Role |
| --- | --- |
| `mail-reader-transition.ts` | Every duration, easing, keyframe and width class. Change timing here only. |
| `mail-app-main-layout.tsx` | `@container` wrapper. Sets `--mail-reader-ms` and `--mail-reader-ease` for the CSS side. |
| `mail-app-detail-pane.tsx` | Reader pane: `absolute right-0`, final width, slides with `translate`. |
| `mail-app-list-column.tsx` | List column: switches width, runs the WAAPI list fade. |
| `use-deferred-reader-pane.ts` | Moves the reader two frames after the heavy render, on open and on close. |
| `../use-mail-app-content-controller.tsx` | `wantsDesktopDetailPane` (the request) → `showDesktopDetailPane` (reader position, deferred), `desktopDetailPanePending` (open requested, not sliding yet) and `desktopDetailPaneActive` (list layout and reader interactivity). Unmounts on close once the slide has finished (`closingMessageId`). |
| `../message-reader/message-reader-shell.tsx` | Content fade when switching messages inside an open reader. |
| `../message-reader/message-reader-body.tsx` | Body skeleton while the body loads or decrypts, then a fade in place. |
| `../message-reader/html-email-renderer.tsx` | Keeps the iframe hidden over a matching surface until its document loads, then fades it in. |
| `../message-list/message-list-virtualized.tsx` | Keeps the selected row still when rows switch between inline and stacked. |

## Layout

- The list is the only flex item. Its width is `w-full` when closed and `clamp(300px,32cqw,420px)` when open.
- The reader is absolutely positioned on top of the list (`z-10`) at its final width, `100cqw - clamp(...)`. List width plus reader width is exactly `100cqw`, so the reader's `border-l` is the divider.
- The reader moves by `translate-x-full` ↔ `translate-x-0`, which is 100% of its own width. No pixel math happens in JS, so the divider can't drift.
- The message inside the reader has a fixed width. It never reflows during the animation.

## Timeline

**Open**
1. Click → `wantsDesktopDetailPane` becomes true. The reader renders while still off-screen and `inert`, and it drops `invisible` so the browser can draw it before it moves.
2. Two animation frames later `showDesktopDetailPane` (and so `desktopDetailPaneActive`) becomes true, and all of the following start in the same frame:
   - the reader slides in (CSS `translate` transition);
   - the list width transitions to narrow and the rows switch to the stacked layout (`narrow`), with the selected row anchored;
   - the list fades `0.4 → 1` over half the duration (WAAPI).
3. The list's layout changes happen under the opaque reader, so if the main thread falls behind, the lag is hidden.

**Close**
This mirrors the open: the heavy render goes first, the slide second.
1. Click → `wantsDesktopDetailPane` and `desktopDetailPaneActive` become false. The reader turns `inert` but stays in place, covering the list. Underneath it, the list jumps to `w-full` (no width transition) and the rows switch to inline, with the selected row anchored. The list fade (`0.4 → 1`, full duration) starts here.
2. Two animation frames later `showDesktopDetailPane` becomes false and the reader slides out over an already-painted list.
3. `visibility` switches to hidden at the end of the transition. The controller's unmount timer starts when the slide starts (`showDesktopDetailPane` false), not at the click, so the message never disappears from a pane that is still on screen. Opening another message during a close cancels the close.

## Text easing in without layout shift

- **Reader.** The shell renders right away from the list metadata (subject, sender, date). Only the body area waits. While the body loads or decrypts, `MessageDecryptingSkeleton` fills the same `flex-1` box the body will use, so the swap doesn't move anything. When the body arrives, it fades in place.
- **Iframe.** An iframe paints nothing until its document loads. The frame sits on `mailBodySurfaceClassName`, which uses the same background as the email document, and stays at `opacity-0` until the first `load`, then fades in. `HtmlEmailRenderer` is keyed by message id, so each message fades in once. Toggling quoted text or remote images reloads the frame in place without a fade.
- **List.** Rows change height when they switch between inline and stacked. On every `narrow` flip, `message-list-virtualized.tsx` works out the row starts for both layouts from `getRowHeight` and moves `scrollTop` by the difference. The clicked row stays under the cursor, or the top row stays put when the selected row is off-screen.
- All of these fades go through `fadeInMailReaderContent`. It skips the fade when motion is reduced or `isMailReaderPaneMoving` is true (an `[inert]` ancestor, or a running transition on `[data-mail-reader-pane]`). Content that arrives during the slide just appears, which is hard to notice while the pane is moving.

## Firefox (Linux) fixes, and the rules they imply

Opening used to stutter in Firefox while closing was smooth. The fixes:

1. **Only animate `translate` and `opacity` on things you can see moving.** Firefox runs these on the compositor, so they stay smooth while React and layout keep the main thread busy. The visible slide is the reader's `translate`. The list width transition is hidden underneath it.
2. **Start the slide two frames late, in both directions** (`useDeferredReaderPane`). The heavy first render of the message used to land in the first frames of the open slide, and Firefox dropped them. Rendering first and then sliding fixed the "stuck, then jump" start. Close does the same with the full-width list re-render: it happens under the still-covering reader, then the reader slides.
3. **Keep the pending reader visible off-screen**, not `invisible`. Firefox skips drawing hidden content, so it had to draw the whole reader (iframe included) in the first animation frame.
4. **No opacity animations inside the sliding panel while it opens.** Reader fades use `fadeInMailReaderContent`, which skips the fade while the pane is pending, closed or sliding. Opacity layers stacked on a moving layer that contains an iframe stutter in Firefox.
5. **Keep the list fade short on open** (`MAIL_LIST_OPEN_FADE_OPTIONS`, half the duration). The rows lay out again every frame while narrowing, so Firefox has to redo the whole fade on every frame. Close fades static content, so it keeps the full length.
6. **Use WAAPI (`element.animate`), not GSAP, for these fades.** GSAP writes inline styles from the main thread every frame. WAAPI opacity runs on the compositor.
7. **`contain-strict` on the reader pane.** Changes around the pane don't force Firefox to recalculate its layout or repaint it. Anything inside that needs `position: fixed` must use a portal (Radix components already do).

## Changing it safely

- Change duration and easing only in `mail-reader-transition.ts`. The CSS variables, the WAAPI options and the controller's close timer all read from it.
- Don't reintroduce a width transition on the reader or on anything visible that sits next to it. Layout-driven motion is what stuttered.
- Don't switch the list layout at the end of the open. A layout swap once the motion has settled reads as a pop. Swap at the start, when the click happens.
- Keep `motion-reduce:duration-[1ms]` and the `usePrefersReducedMotion` guards.
- Tests: `__tests__/components/mail-app.test.tsx` covers the delayed close and waits for the delayed open. Don't assert the pending state right after the click, because two frames can already have passed under load, which makes the test flaky. The reader turning `inert` right after a close click is safe to assert, because it doesn't wait for a frame.

## Debugging checklist

- Firefox `about:support` → Compositing. If it says "WebRender (Software)", there's no GPU acceleration and any large animation will struggle.
- Firefox profiler (`about:profiling`, "Graphics" preset): look for long main-thread tasks at the start of the open, and "Rasterize" spikes on the reader layer.
- If the start of a slide stutters, check what renders in the frame where `showDesktopDetailPane` flips: row re-renders from `narrow` (on open only), message body loading, the iframe resizing. On close that frame should render almost nothing, because the list re-render belongs to the earlier `wantsDesktopDetailPane` flip.
