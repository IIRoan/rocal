# solace-api-tests

Black-box API suite for the Solace backend. The same tests run against the current TypeScript backend and the Rust rewrite, so they pin down behavior rather than implementation.

## Running

By default the suite starts the Rust server in-process on a fresh clone of the template database:

```sh
cargo xtask test-env up                      # local Postgres 18 + test Stalwart (podman)
cargo xtask test-env template                # solace_test_template from the 53 migrations
cargo test -p solace-api-tests --test api
```

Against a running backend, such as the current TypeScript one:

```sh
cargo xtask test-env clone solace_test_suite
cargo xtask ts-backend --checkout <worktree without .env files> --database solace_test_suite --port 4101 &
API_BASE_URL=http://localhost:4101 \
TEST_DATABASE_URL=postgres://solace_test:solace-test-pg@127.0.0.1:55432/solace_test_suite \
  cargo test -p solace-api-tests --test api
```

`TEST_DATABASE_URL` is the backend's own database; tests read it for state checks. Avatar uploads go to the `solace-test-avatars` bucket in the local S3 mock that `test-env up` starts (`TEST_AVATAR_BUCKET*` point elsewhere; the suite hands them to the backend as `AVATAR_BUCKET*`). Every URL, database, bucket and secret goes through `src/guard.rs`, which refuses anything that is not a test resource.

The test Stalwart image is pinned to 1.0.0. Its provisioning key cache uses `$XDG_DATA_HOME/solace-test-tools` when set, otherwise `$HOME/.local/share/solace-test-tools`; set `XDG_DATA_HOME` to a writable test directory in a restricted environment.

## Writing tests

- One module per domain in `tests/api/`, registered in `tests/api/main.rs`. Shared helpers live in `tests/api/helpers.rs`.
- Each test calls `TestApp::spawn()` and creates its own users with `app.user().await`. Tests run in parallel against one backend and one database, so never rely on global state or row counts across users; scope every query by the test's own ids.
- Decode success bodies with `response.dto::<T>()`, using the DTOs in `solace-api-types`. It fails unless the DTO round-trips the exact JSON, so a DTO can't silently drop a field or change `null` into absent. Model absent-or-value as `Option<T>` with `#[serde(default, skip_serializing_if = "Option::is_none")]`, always-present nullable as plain `Option<T>`, and present-but-maybe-null-or-absent as `Option<Option<T>>` with `serde_with::rust::double_option`.
- Errors: `response.expect_error(status, error, message)` checks the `lib/errors.ts` envelope. Validation errors carry Zod v3's message and `details.issues[].path`; service errors carry `details.field`. The auth guard's 401 and 403 have no `requestId` (`expect_unauthorized`).
- Cover each route for every role that applies:
  - **owner**: response DTO plus database (and `notification_job` outbox) state;
  - **permitted sharee**: an event participant, a share-link holder;
  - **revoked sharee**: after the participant is removed or the link disabled or rotated;
  - **unrelated user**: their request must not read or change the owner's rows, and the database stays unchanged;
  - **anonymous caller**: `expect_unauthorized`;
  - **forged owner id**: `userId` and similar fields in bodies and queries are rejected (`expect_unknown_field`), and ids in paths that belong to someone else behave as not found.
- Use only reserved test data: `@solace.test` mailboxes, `example.com` or `.invalid` for outside addresses, documentation IP ranges.
- Comments follow the repository rule: one line, only for a non-obvious reason.

## Jest destinations

`jest/cases.tsv` lists every backend Jest case (from `jest --json`, parameterized rows expanded). Each domain file `jest/<domain>.tsv` gives every case of its Jest files one destination, as `file<TAB>full name<TAB>destination`:

- `suite:<module>::<test>` for a test in this suite;
- `unit:<crate>::<path>::<test>` for a Rust unit test in the server, written with the code it covers;
- `n/a: <reason>` when the case tests TypeScript-only machinery (mock wiring, Elysia or Prisma internals).
