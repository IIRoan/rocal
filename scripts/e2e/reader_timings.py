import json


CONVERSATION_JOURNEYS = frozenset((
    "07-conversation-first-message", "08-conversation-replies", "09-conversation-reader",
))


def collect_reader_timings(traces):
    measurements = []
    observed = set()
    if traces.is_symlink():
        return measurements
    for source in sorted(traces.rglob("commands.json")):
        if source.is_symlink() or not source.resolve().is_relative_to(traces.resolve()):
            continue
        try:
            if source.stat().st_size > 8 * 1024 * 1024:
                continue
            entries = json.loads(source.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(entries, list):
            continue
        tap = None
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            metadata = entry.get("metadata", {})
            if not isinstance(metadata, dict) or metadata.get("status") != "COMPLETED":
                continue
            timestamp, duration = metadata.get("timestamp"), metadata.get("duration")
            if type(timestamp) is not int or type(duration) is not int or timestamp <= 0 or not 0 <= duration <= 1_200_000:
                continue
            command = metadata.get("evaluatedCommand", entry.get("command", {}))
            if not isinstance(command, dict):
                continue
            if "tapOnElement" in command:
                tap = timestamp
            assertion = command.get("assertConditionCommand", {})
            if not isinstance(assertion, dict):
                continue
            condition = assertion.get("condition", {})
            if not isinstance(condition, dict):
                continue
            visible = condition.get("visible", {})
            if not isinstance(visible, dict) or visible.get("idRegex") != "mail-expanded-message":
                continue
            budget = assertion.get("timeout")
            if budget not in ("5000", "10000") or tap is None:
                continue
            opening = timestamp + duration - tap
            if not 0 <= opening <= 1_200_000 or (timestamp, duration) in observed:
                continue
            observed.add((timestamp, duration))
            measurements.append({
                "opening": len(measurements) + 1,
                "tapToBodyMs": opening,
                "bodyAssertionMs": duration,
                "bodyWaitBudgetMs": int(budget),
            })
    return measurements
