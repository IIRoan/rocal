require ["variables", "editheader", "relational", "comparator-i;ascii-numeric", "vnd.stalwart.expressions"];

# Only this script may set the Solace markers.
deleteheader "X-Solace-SimpleLogin";
deleteheader "X-Solace-Original-From";

# DKIM-aligned simplelogin.co forward whose replies can only go to reverse aliases.
if not allof (
    eval "contains(env.dkim.domains, 'simplelogin.co')",
    header :count "eq" :comparator "i;ascii-numeric" "From" "1",
    address :domain :is "From" "simplelogin.co",
    header :count "eq" :comparator "i;ascii-numeric" "X-SimpleLogin-Type" "1",
    header :is "X-SimpleLogin-Type" "Forward",
    exists "X-SimpleLogin-Envelope-To",
    anyof (
        not exists "Reply-To",
        allof (
            address :count "eq" :comparator "i;ascii-numeric" "Reply-To" "1",
            address :domain :is "Reply-To" "simplelogin.co"
        )
    )
) {
    stop;
}

addheader "X-Solace-SimpleLogin" "forward";

# X-SimpleLogin-Original-From is unsigned, so it must match SimpleLogin's signed From name.
if not string :matches "${header.x-simplelogin-original-from.addr}" "*@*" {
    stop;
}
set "sender_local" "${1}";
set "sender_domain" "${2}";
set "sender_name" "${header.x-simplelogin-original-from.name}";
set "sender_raw" "${header.x-simplelogin-original-from.raw}";
set "reverse_alias" "${header.from.raw}";
if anyof (
    not header :count "eq" :comparator "i;ascii-numeric" "X-SimpleLogin-Original-From" "1",
    string :is "${sender_local}" "",
    string :is "${sender_domain}" "",
    not anyof (
        string :is "${header.from.name}" "${sender_name} - ${sender_local} at ${sender_domain}",
        string :is "${header.from.name}" "${sender_local} at ${sender_domain}"
    )
) {
    stop;
}

addheader "X-Solace-Original-From" "${reverse_alias}";
if not exists "Reply-To" {
    addheader "Reply-To" "${reverse_alias}";
}
deleteheader "From";
addheader "From" "${sender_raw}";
