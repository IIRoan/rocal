# User Testing

## Validation Surface

The mobile app is validated by the user on a physical device or simulator. Workers cannot run the app.

**Surface:** Expo Go / development build on iOS/Android device
**Tools:** User visual inspection only
**Automated checks:** typecheck + lint (run by workers)

## Validation Concurrency

Not applicable — user performs visual verification manually. No automated UI testing.

## Flow Validator Guidance: static-checks
Since the user handles visual verification manually and these assertions only require static checks (typechecking, diffing, code review), the flow validator should read the files, perform typechecks and linting locally, and report the findings.
