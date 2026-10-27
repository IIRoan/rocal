# Completed security validation controls

This temporary draft PR must never be merged. The deliberately vulnerable dependency and inert source/Dockerfile fixtures have been removed; the remaining workflow guards isolate only this test branch from mobile publishing.

Positive controls on commit `570a6684`:

| Control | Observed result |
| --- | --- |
| Lodash 4.17.20, unused development dependency | Native dependency review failed for GHSA-35jh-r3h4-6jhm and GHSA-r5fr-rjxr-66jc; Bun also reported its advisories |
| Unexecuted Express-to-process command flow | CodeQL reported critical js/command-line-injection (alert 4253) and high js/missing-rate-limiting (alert 4252) |
| Unused root-user Dockerfile | Trivy reported high DS-0002 (alert 4250) and low DS-0026 (alert 4251) |

The merged master baseline passed both Security and CodeQL. Local tests of the actual merged Bun-reporting step distinguish valid advisory responses from missing/malformed reports. Secret protection settings are enabled; no real credentials were used as test fixtures.

An existing automatic PR publisher briefly published a Calendar testing-channel update before cancellation. That test group was deleted, its absence verified, and the previous testing update remains latest. Mail did not publish a test update. Production publishing jobs were skipped. Branch-local guards prevent subsequent test pushes from publishing anything.

The PR will be closed after clean recovery checks finish. Production workflows and dependencies are not changed by this validation branch.
