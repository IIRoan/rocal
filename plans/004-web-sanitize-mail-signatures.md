# Plan 004: Harden mail signature HTML sanitization

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bcf873..HEAD -- apps/web/lib/mail/signature-utils.ts apps/web/components/mail/compose-dialog.tsx apps/web/__tests__/lib/signature-utils.test.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `7bcf873`, 2026-06-26

## Why this matters

Compose signature HTML is rendered with `dangerouslySetInnerHTML` and appended unsanitized to outbound mail. The existing `sanitizeSignatureHtml` strips dangerous tags but not `on*` event attributes, while quoted-email sanitization (`sanitizeQuotedEmailHtml`) does both. Aligning signature sanitization closes a self-XSS/stored-XSS gap without changing mail protocol or UI structure.

## Current state

**Unsanitized preview** (`apps/web/components/mail/compose-dialog.tsx:745-750`):

```tsx
dangerouslySetInnerHTML={{
  __html: signatureIdentity.htmlSignature,
}}
```

**Unsanitized outbound append** (`apps/web/lib/mail/signature-utils.ts:164-165`):

```ts
return `${htmlBody}${sep}${signature.htmlSignature}`;
```

**Weaker sanitizer** (`signature-utils.ts:200-207`) — removes `script, style, iframe, object, embed` only.

**Stronger pattern** (`apps/web/lib/mail/compose-editor-utils.ts:46-50`):

```ts
doc.querySelectorAll("*").forEach((el) => {
  for (const attr of Array.from(el.attributes)) {
    if (/^on/i.test(attr.name)) {
      el.removeAttribute(attr.name);
    }
  }
});
```

`sanitizeSignatureHtml` is already used in `buildEmbeddedSignatureHtml` (line 221) but is private and incomplete.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Signature tests | `cd apps/web && bun run test -- __tests__/lib/signature-utils.test.ts` | all pass |
| Web typecheck | `cd apps/web && bun run typecheck` | exit 0 |

## Scope

**In scope:**

- `apps/web/lib/mail/signature-utils.ts`
- `apps/web/components/mail/compose-dialog.tsx`
- `apps/web/__tests__/lib/signature-utils.test.ts`

**Out of scope:**

- Inbound mail iframe rendering (`message-reader.tsx`) — separate hardening effort
- Native `signature-utils.ts` — parity follow-up after web lands
- Changing JMAP identity storage

## Git workflow

- Branch: `advisor/004-web-sanitize-mail-signatures`
- Commit style: `harden mail signature HTML sanitization`

## Steps

### Step 1: Strengthen sanitizeSignatureHtml

In `signature-utils.ts`:

1. Export `sanitizeSignatureHtml` (rename to exported if needed).
2. After removing dangerous tags, add the `on*` attribute stripping loop from `sanitizeQuotedEmailHtml`.
3. Consider extracting shared DOM sanitizer to `compose-editor-utils.ts` **only if** it reduces duplication without scope creep — optional.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 2: Sanitize at all render/send boundaries

1. `appendHtmlSignature`: wrap `signature.htmlSignature` with `sanitizeSignatureHtml` before concatenation.
2. `compose-dialog.tsx` preview: use `sanitizeSignatureHtml(signatureIdentity.htmlSignature)` in `dangerouslySetInnerHTML`.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 3: Add regression tests

In `signature-utils.test.ts`:

```ts
it("strips onerror handlers from html signatures", () => {
  const malicious = '<img src=x onerror="alert(1)">';
  expect(sanitizeSignatureHtml(malicious)).not.toMatch(/onerror/i);
});

it("appendHtmlSignature sanitizes embedded html", () => {
  const result = appendHtmlSignature("<p>Hi</p>", {
    htmlSignature: '<img onerror="alert(1)">',
  });
  expect(result).not.toMatch(/onerror/i);
});
```

**Verify**: `cd apps/web && bun run test -- __tests__/lib/signature-utils.test.ts` → all pass

## Test plan

- Tests above plus ensure legitimate signatures (`<a href>`, `<b>`, `<br>`) still pass through.
- Manual: identity with bold/link signature still previews correctly in compose.

## Done criteria

- [ ] `compose-dialog.tsx` preview uses `sanitizeSignatureHtml`
- [ ] `appendHtmlSignature` sanitizes before append
- [ ] `on*` attributes stripped in sanitizer
- [ ] New malicious-payload tests pass
- [ ] `bun run typecheck` exits 0
- [ ] `plans/README.md` row 004 → DONE

## STOP conditions

- Sanitizer strips legitimate signature markup users rely on (e.g. inline styles) — document what was stripped and STOP for product decision rather than weakening security.
- `sanitizeSignatureHtml` runs in SSR without `document` — preserve existing `typeof document === "undefined"` early return behavior for tests/SSR.

## Maintenance notes

- Any new `dangerouslySetInnerHTML` for signatures must go through `sanitizeSignatureHtml`.
- Consider consolidating with `sanitizeQuotedEmailHtml` in a future refactor — not required for this plan.
