---
name: mobile-ui-worker
description: A worker that creates mobile-specific UI components.
---

# Mobile UI Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

This skill should be used for creating and modifying mobile-specific UI components in the `packages/mobile-ui` directory.

## Required Skills

None

## Work Procedure

1.  **Create the component:** Create the new mobile-specific component in the `packages/mobile-ui/src` directory.
2.  **Add styles:** Add any necessary styles to the component.
3.  **Add tests:** Add unit and integration tests for the new component.
4.  **Verify:** Manually verify the component on a device or emulator.

## Example Handoff

```json
{
  "salientSummary": "Created a new MobilePage component with safe area handling.",
  "whatWasImplemented": "Created the MobilePage component in `packages/mobile-ui/src/MobilePage.tsx` and added styles to handle safe areas. Also added a basic unit test.",
  "whatWasLeftUndone": "",
  "verification.commandsRun": [
    {
      "command": "bun test",
      "exitCode": 0,
      "observation": "All tests passed."
    }
  ],
  "verification.interactiveChecks": [
    {
      "action": "Viewed the MobilePage component on an iPhone emulator.",
      "observed": "The content was displayed within the safe areas."
    }
  ],
  "tests.added": [
    {
      "file": "packages/mobile-ui/src/MobilePage.test.tsx",
      "cases": [
        {
          "name": "renders children",
          "verifies": "The component renders its children."
        }
      ]
    }
  ],
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

Return to the orchestrator if there are any issues with the existing setup that prevent the creation of new components.
