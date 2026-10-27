# Temporary security validation

This draft PR exists only to validate the merged security workflows. It must never be merged or deployed.

- An unused, test-only Lodash 4.17.20 development dependency should trigger GitHub's new-dependency vulnerability gate and appear in Bun audit.
- The unexecuted Express route in `command-injection.js` should produce a CodeQL command-injection alert. Nothing imports this file or starts its application.
- The unused Dockerfile should produce Trivy's root-user configuration finding. It is not part of any application image build.

After detection, all fixtures and dependency changes will be removed, the recovery checks will run, and this PR will be closed without merging.
