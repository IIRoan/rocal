# PostgreSQL subject-search regression (#186)

Build the test image, then run the disposable probe:

```sh
podman build -t localhost/solace-test-stalwart -f apps/stalwart/test-env/Dockerfile apps/stalwart
python3 apps/stalwart/tests/probe_subject_search.py --assert-fixed
```

`cargo xtask test-env up` also builds the image when its mail container is not already running; the explicit build avoids using a stale image while an existing test service stays up.

Each invocation creates fresh PostgreSQL 18 and Stalwart containers on an internal Podman network, publishes one random loopback port, and removes everything it created. Images must already be local; `--image` selects a different built test image. It waits for the test plan and listener restart before signing in, so startup retries cannot trigger failed-login bans. It imports the committed synthetic PGP/MIME fixture as drafts, searches only for those drafts, inspects the original subject's synthetic index row, and destroys them. No submission is made. There are no production URL or credential options. PR CI runs this against the patched release binary.

Unmodified Stalwart 1.1.0 reproduces the issue: `calm`, `morning`, and the invented marker match, while `river` and the complete subject do not. The stored subject vector contains `riv`; English and simple queries produce `river`, whereas PostgreSQL's Norwegian query produces `riv` and matches. The probe checks both subject and general text filters, prefixes, quoted phrases, absent terms, English subjects and German literal words. It also rejects a phrase formed by joining the last and first words, which catches accidental concatenation of duplicate vectors. `--assert-fixed` requires the expected positive and negative results and a subject vector equal to PostgreSQL's `simple` output.

A separate run of the release's whatlang 0.18.0 dependency detects this exact subject as Norwegian Bokmal, confidence 0.0495658974. In the [release detector](https://github.com/stalwartlabs/stalwart/blob/v1.1.0/crates/nlp/src/language/detect.rs), even guesses below the 0.6 acceptance threshold enter the language-frequency map. [Indexing](https://github.com/stalwartlabs/stalwart/blob/v1.1.0/crates/email/src/message/index/search.rs) subsequently uses that map to resolve unknown languages. [Query detection](https://github.com/stalwartlabs/stalwart/blob/v1.1.0/crates/nlp/src/language/mod.rs) instead falls back below 0.3. This deterministic source trace and the observed Norwegian-compatible vector establish the mismatch; PostgreSQL does not retain the selected language beside the vector. Upstream tests also bypass the frequency-map fallback under `cfg(stalwart_tests)`, so a release-binary regression matters.

Both Dockerfiles build the official 1.1.0 source at commit `e7cde9b3fac32d2a254ef782efec56f2373ec5d4` using the shared `scripts/build-stalwart.sh`, its locked dependencies and the release image's feature set. `stalwart-subject-search.patch` selects `simple` only for the PostgreSQL subject field. Existing queries already include the matching configuration; bodies, attachments, other stores, encrypted writers and client requests keep their existing behavior. The build fails if the patch no longer applies or the compiled and base-image Stalwart versions differ. The build downloads upstream's public AGPL source at the pinned commit; this repository contains the applied patch. Update the source commit and release image pins together, and retire the patch once the official release preserves literal subject matches. No upstream report has been submitted.

Literal subject matches no longer depend on a guessed language. The deliberate tradeoff is that searching `report` does not expand to a subject containing only `reports`; searching `reports` or `report*` still finds it. Retaining both language-based expansion and literal matching would require a separate unstemmed vector with its own predicate, rather than concatenating duplicate vectors and introducing false phrase matches.

After deployment, wait until every indexing node runs the patched binary, then queue an application-level rebuild through Stalwart's supported task API:

```sh
stalwart-cli create Task/StoreMaintenance \
  --field maintenanceType=reindexAccounts \
  --field 'status={"@type":"Pending","due":"2026-01-01T00:00:00Z"}'
```

Use the existing authenticated operator CLI configuration; no credentials belong in this document. The past due time starts the task immediately. It queues one rebuild per account; monitor `IndexQueueStatus` until those queues drain before checking existing mail. A PostgreSQL `REINDEX` only rebuilds database indexes over the existing vectors and cannot regenerate the lost original words. Reindexing before all old writers have stopped can reintroduce their stemmed vectors. Rolling back the image remains schema-compatible; another application rebuild restores the previous search behavior if required.
