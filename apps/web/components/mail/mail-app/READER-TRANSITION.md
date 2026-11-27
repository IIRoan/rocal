# Desktop mail reader

How the desktop list and reader are laid out, how a conversation slides in like a drawer once it has loaded, and how content eases in without moving anything. Read this before touching the list/reader layout or its motion. Most of the rules exist because an earlier sliding reader stuttered in Firefox on Linux.

## Files

| File | Role |
| --- | --- |
| `mail-reader-transition.ts` | The list column width, the drawer timing (`MAIL_READER_DRAWER_MS`) and the content fade (`fadeInMailReaderContent`). Change timing here only. |
| `mail-reader-layer.tsx` | `useMailReaderDrawer` and `MailReaderLayer`: one surface per conversation, hidden until ready, slid across the empty reader on open, swapped in place on a switch and slid off on close. |
| `mail-app-main-layout.tsx` | `@container` row holding the two surfaces with an 8px gap. |
| `mail-app-list-column.tsx` | List surface at `clamp(300px,32cqw,420px)`, stacked rows (`narrow`) on desktop. |
| `mail-app-detail-pane.tsx` | Reader surface taking the rest of the row; shows the open conversation's layer, full compose, or the empty state. |
| `../../../hooks/use-mail-app.ts` | `isSelectedConversationReady`: the thread (a `useQuery` on `mailQueryKeys.threadMessages`), the body, its decryption and the earlier messages' previews are in. |
| `../message-reader/message-reader-body.tsx` | An empty body surface (`MessageBodyPending`) while another message in the thread loads or decrypts, then a fade in place. |
| `../message-reader/html-email-renderer.tsx` | Keeps the iframe hidden over a matching surface until its document loads, then fades it in. |
| `../message-list/message-list-virtualized.tsx` | Keeps the selected row still when rows switch between inline and stacked. |

## Layout

- On desktop the list and the reader are always both on screen, as two rounded surfaces on the sidebar's backdrop. The list keeps its width and the reader fills the rest of the row, so opening, switching or closing a message never moves the list.
- With nothing open the reader shows its empty state (the Solace mark and "Select a conversation"). A closing conversation slides off over it.
- Mobile keeps one full-screen pane: the list, or the reader once a message is open.

## Text easing in without layout shift

- **Opening.** Each conversation (keyed by thread) gets its own `MailReaderLayer`. It renders at once but stays `invisible` and `inert` until `isSelectedConversationReady`, so the reader never shows half loaded; a small "Loading conversation" note fades in only if that takes over 350ms. From the empty state the layer then slides across the full width from the right edge (240ms). A thread opened before comes from the query cache, so it opens without waiting while it refreshes.
- **Switching.** The conversation on screen keeps its last frame (inert) until the next one is ready, then the next simply replaces it, with no slide.
- **Closing.** The layer slides off to the right over the empty state at the same pace and easing as the slide in. It waits for the empty state's first paint, so its first frames aren't dropped. Reopening it mid-slide brings it straight back.
- **Messages inside a thread.** Picking an earlier message loads or decrypts its body in place: `MessageBodyPending` holds the body's `flex-1` box on the body surface, so nothing moves, and the body fades in when it arrives.
- **Iframe.** An iframe paints nothing until its document loads. The frame sits on `mailBodySurfaceClassName`, which uses the same background as the email document, and stays at `opacity-0` until the first `load`, then fades in. `HtmlEmailRenderer` is keyed by message id, so each message fades in once. Toggling quoted text or remote images reloads the frame in place without a fade.
- **List.** Rows change height when they switch between inline and stacked (crossing the mobile breakpoint). On every `narrow` flip, `message-list-virtualized.tsx` works out the row starts for both layouts from `getRowHeight` and moves `scrollTop` by the difference, so the selected row stays put.
- All of the nested fades go through `fadeInMailReaderContent`. It holds the fade until the content has painted (`playAfterPaint`), and skips it when motion is reduced, the content sits in an `[inert]` subtree (a layer still loading or sliding out), or its layer (`[data-mail-reader-content]`) is sliding in (checked again when the fade would start, because the slide is held for its first paint too). Content that arrives during the slide just appears inside the moving block.

## Rules that keep it smooth in Firefox

1. **Only animate `translate` and `opacity`.** Firefox runs these on the compositor, so they stay smooth while React and layout keep the main thread busy. Never animate the width of the list or the reader.
2. **Fade after paint.** Heavy content (a decrypted body, an iframe) renders first and fades once painted, so its first frame is never dropped.
3. **Use WAAPI (`element.animate`), not GSAP.** GSAP writes inline styles from the main thread every frame; WAAPI opacity runs on the compositor.
4. **Anything inside the reader that needs `position: fixed` uses a portal** (Radix components already do), because the surfaces clip their overflow.

## Changing it safely

- Change the fade duration and easing only in `mail-reader-transition.ts`.
- The reader slides only with `transform` and `opacity` inside its fixed surface. Don't reintroduce a reader or list that changes width when a message opens; that layout shift is what this layout removes.
- Keep the `usePrefersReducedMotion` guards.
- Tests: `__tests__/components/mail-app.test.tsx` covers the empty state, closing a message and waiting for the thread before revealing a conversation.
