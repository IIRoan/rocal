# Desktop mail reader

How the desktop list and reader are laid out, and how content eases in without moving anything. Read this before touching the list/reader layout or its motion. Most of the rules exist because an earlier sliding reader stuttered in Firefox on Linux.

## Files

| File | Role |
| --- | --- |
| `mail-reader-transition.ts` | The list column width and the content fade (`fadeInMailReaderContent`). Change timing here only. |
| `mail-app-main-layout.tsx` | `@container` row holding the two surfaces with an 8px gap. |
| `mail-app-list-column.tsx` | List surface at `clamp(300px,32cqw,420px)`, stacked rows (`narrow`) on desktop. |
| `mail-app-detail-pane.tsx` | Reader surface taking the rest of the row; shows the open message, full compose, or the empty state. |
| `../message-reader/message-reader-shell.tsx` | Content fade when switching messages inside the reader. |
| `../message-reader/message-reader-body.tsx` | Body skeleton while the body loads or decrypts, then a fade in place. |
| `../message-reader/html-email-renderer.tsx` | Keeps the iframe hidden over a matching surface until its document loads, then fades it in. |
| `../message-list/message-list-virtualized.tsx` | Keeps the selected row still when rows switch between inline and stacked. |

## Layout

- On desktop the list and the reader are always both on screen, as two rounded surfaces on the sidebar's backdrop. The list keeps its width and the reader fills the rest of the row, so opening, switching or closing a message never moves the list.
- With nothing open the reader shows its empty state (the Solace mark, "Select a conversation" and the J/K and C shortcuts). Closing a message clears the selection and the empty state returns at once.
- Mobile keeps one full-screen pane: the list, or the reader once a message is open.

## Text easing in without layout shift

- **Reader.** The shell renders right away from the list metadata (subject, sender, date). Only the body area waits. While the body loads or decrypts, `MessageDecryptingSkeleton` fills the same `flex-1` box the body will use, so the swap doesn't move anything. When the body arrives, it fades in place.
- **Iframe.** An iframe paints nothing until its document loads. The frame sits on `mailBodySurfaceClassName`, which uses the same background as the email document, and stays at `opacity-0` until the first `load`, then fades in. `HtmlEmailRenderer` is keyed by message id, so each message fades in once. Toggling quoted text or remote images reloads the frame in place without a fade.
- **List.** Rows change height when they switch between inline and stacked (crossing the mobile breakpoint). On every `narrow` flip, `message-list-virtualized.tsx` works out the row starts for both layouts from `getRowHeight` and moves `scrollTop` by the difference, so the selected row stays put.
- **Switching conversations.** The toolbar stays put while the title and thread (`[data-mail-reader-content]` in `message-reader-shell.tsx`) slide in together with `slideFadeIn`: a newer conversation drops in from 14px above, an older one rises from 14px below, so moving through the list reads like moving through a stack of mail.
- All of the nested fades go through `fadeInMailReaderContent`. It holds the fade until the content has painted (`playAfterPaint`), and skips it when motion is reduced, the content sits in an `[inert]` subtree, or the conversation around it is sliding in (checked again when the fade would start, because the slide is held for its first paint too). Content that arrives during the slide just appears inside the moving block.

## Rules that keep it smooth in Firefox

1. **Only animate `translate` and `opacity`.** Firefox runs these on the compositor, so they stay smooth while React and layout keep the main thread busy. Never animate the width of the list or the reader.
2. **Fade after paint.** Heavy content (a decrypted body, an iframe) renders first and fades once painted, so its first frame is never dropped.
3. **Use WAAPI (`element.animate`), not GSAP.** GSAP writes inline styles from the main thread every frame; WAAPI opacity runs on the compositor.
4. **Anything inside the reader that needs `position: fixed` uses a portal** (Radix components already do), because the surfaces clip their overflow.

## Changing it safely

- Change the fade duration and easing only in `mail-reader-transition.ts`.
- Don't reintroduce a reader that slides in or a list that changes width when a message opens; that layout shift is what this layout removes.
- Keep the `usePrefersReducedMotion` guards.
- Tests: `__tests__/components/mail-app.test.tsx` covers the empty state and closing a message.
