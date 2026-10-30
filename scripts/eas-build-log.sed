# Strip device UDIDs, team ids and certificate serials/fingerprints from public EAS build logs.
s/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}/[redacted udid]/g
s/[0-9A-Fa-f]{40}/[redacted udid]/g
s/(common name = [^(]*\()[^)]*/\1[redacted]/
s/(Apple Team( ID)?[[:space:]]*[:=]?[[:space:]]*)[^[:space:])]+/\1[redacted]/g
s/^([[:space:]]*(Serial Number|Developer Portal ID)[[:space:]]+).*/\1[redacted]/
s/^([[:space:]]*-[[:space:]]+).*\(UDID:.*/\1[redacted device]/
s/^([[:space:]]*Provisioned devices[[:space:]]+).*/\1[redacted]/
