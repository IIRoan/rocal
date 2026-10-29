# Security scanning

Chainguard Guardener maintains the hardened Actions and container migrations in `.chainguard/`. GitHub runs the scanners below on pull requests, pushes to `master`, a daily schedule, and manual dispatches. These use standard GitHub-hosted runners, which are free while this repository is public; no additional scanning subscription or registry credentials are required.

| Check | Coverage |
| --- | --- |
| CodeQL | Rust API and notifications, JavaScript/TypeScript web and Expo apps and shared packages, Python helpers, Actions workflows, and the Swift notification extension |
| Bun audit | Every JavaScript workspace in `bun.lock`, including transitive and development dependencies |
| Trivy repository | Cargo dependencies including development dependencies, and Dockerfile misconfigurations |
| Trivy containers | Images built from the backend, notifications, Stalwart, and Gatus Dockerfiles |
| Trivy Rust build stages | Debian build-stage packages, including the OpenSSL library statically linked into the Rust executables |
| GitHub secret protection | Repository secret scanning and push protection, enabled in repository settings |
| Dependabot | Dependency alerts and security updates, plus weekly Bun, Cargo, and Actions update PRs |
| Dependency review | High or critical vulnerabilities introduced by dependency changes that GitHub's dependency graph can compare, including development dependencies |

CodeQL uses the `security-extended` queries. The Swift job compiles the checked-in notification extension on macOS; it does not build or publish an Expo app. The Rust analysis does not need a production build. Container jobs build locally on the runner and never push an image or deploy a service. Aikido is not required.

Trivy 0.76.1 misidentifies nested Bun lockfile entries, so repository scanning skips `bun.lock` and the native `bun audit` command handles JavaScript instead. Bun does not install dependencies or run lifecycle scripts during its audit. No generated lockfile or custom parser is needed.

Trivy publishes all severities, including unfixed vulnerabilities, to **Security → Code scanning** and adds inventory summaries to each job. Bun publishes its full advisory response in the job summary. These inventory scans report the existing backlog without failing unrelated pull requests; scanner, registry, build, malformed-report and upload errors still fail their jobs. No advisory IDs are ignored or automatically accepted.

On pull requests, GitHub's native dependency review fails when a dependency change introduces a high or critical advisory in runtime, development or unknown scopes. It uses GitHub's supported dependency graph and does not compare arbitrary container or OS inventories; the full Bun and Trivy scans remain necessary. CodeQL also publishes source findings through GitHub's code scanning checks. The existing `Tests` and `Rust` branch requirements remain in place; new checks are not added as required merge checks automatically.

The build-stage report includes compiler and other build-only packages as well as OpenSSL; it does not prove each reported package ships in the runtime. Cargo scanning is necessary because the Rust executables do not embed an auditable Cargo dependency inventory. Source and freshly built image scans also do not establish which digest is currently deployed, inspect VPS packages or managed Postgres/Redis instances, audit App Store binaries or Apple frameworks, or prove application authorization and E2EE behavior.

To reproduce the dependency checks without installing packages:

```sh
bun audit --json
trivy fs --scanners vuln,misconfig --include-dev-deps --skip-files bun.lock --skip-dirs node_modules,target,.git,webmail --format json --output /tmp/solace-security.json .
trivy convert --format table --scanners vuln,misconfig --table-mode summary /tmp/solace-security.json
```

Native `bun audit` returns exit code 1 for advisories. CI accepts that result only with a valid nonempty advisory response; missing, malformed or error responses still fail. Reports need not be committed. Secrets are handled by GitHub secret protection, and no raw secret-scan output is uploaded as a public artifact. The workflows use SHA-pinned Chainguard hardened Actions; Dependabot proposes updates. If the repository becomes private, revisit GitHub feature eligibility and runner billing before retaining this setup.
