# PostgreSQL subject-search regression (#186)

Run only the disposable probe, after the ordinary test image has been built with `cargo xtask test-env up`:

```sh
python3 apps/stalwart/tests/probe_subject_search.py
python3 apps/stalwart/tests/probe_subject_search.py --assert-fixed
```

Each invocation creates fresh PostgreSQL 18 and Stalwart containers on an internal Podman network, publishes one random loopback port, and removes everything it created. Images must already be local. It imports the committed synthetic PGP/MIME fixture as a draft, searches only for that draft, inspects its synthetic index row, and destroys it. No submission is made. There are no production URL or credential options.

Stalwart 1.1.0 reproduces the issue: `calm`, `morning`, and the invented marker match, while `river` and the complete subject do not. The stored subject vector contains `riv`; English and simple queries produce `river`, whereas PostgreSQL's Norwegian query produces `riv` and matches. `--assert-fixed` intentionally fails until every subject query works, making the probe usable against a corrected test image.

A separate run of the release's whatlang 0.18.0 dependency detects this exact subject as Norwegian Bokmal, confidence 0.0495658974. In the [release detector](https://github.com/stalwartlabs/stalwart/blob/v1.1.0/crates/nlp/src/language/detect.rs), even guesses below the 0.6 acceptance threshold enter the language-frequency map. [Indexing](https://github.com/stalwartlabs/stalwart/blob/v1.1.0/crates/email/src/message/index/search.rs) subsequently uses that map to resolve unknown languages. [Query detection](https://github.com/stalwartlabs/stalwart/blob/v1.1.0/crates/nlp/src/language/mod.rs) instead falls back below 0.3. This deterministic source trace and the observed Norwegian-compatible vector establish the mismatch; PostgreSQL does not retain the selected language beside the vector. Upstream tests also bypass the frequency-map fallback under `cfg(stalwart_tests)`, so a release-binary regression matters.

This probe changes no server settings, mail writer, or search semantics. Correcting Stalwart and rebuilding existing indexes remains upstream work; no upstream report has been submitted.
