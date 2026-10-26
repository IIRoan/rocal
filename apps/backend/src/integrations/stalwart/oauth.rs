use serde_json::{Value, json};
use url::Url;

use crate::mail::bridge::Pkce;

pub fn login_request(
    account_name: &str,
    account_secret: &str,
    client_id: &str,
    redirect_uri: &str,
    pkce: &Pkce,
    state: &str,
) -> Value {
    let query = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs([
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("response_type", "code"),
            ("state", state),
            ("scope", "urn:ietf:params:oauth:scope:mail"),
            ("code_challenge", pkce.challenge.as_str()),
            ("code_challenge_method", "S256"),
        ])
        .finish();
    // The legacy fields keep the bridge working during the 0.16.27 rollout and a rollback.
    json!({
        "type": "authCode",
        "accountName": account_name,
        "accountSecret": account_secret,
        "clientId": client_id,
        "redirectUri": redirect_uri,
        "codeChallenge": pkce.challenge,
        "codeChallengeMethod": "S256",
        "query": query,
        "consent": true,
    })
}

pub fn authorization_code(payload: &Value, redirect_uri: &str, state: &str) -> Option<String> {
    if payload.get("type")?.as_str()? != "authenticated" {
        return None;
    }
    if let Some(location) = payload.get("location") {
        let mut location = Url::parse(location.as_str()?).ok()?;
        let expected = Url::parse(redirect_uri).ok()?;
        let pairs: Vec<_> = location
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        location.set_query(expected.query());
        if location != expected || pairs.iter().any(|(key, _)| key == "error") {
            return None;
        }
        let one = |name: &str| {
            let mut values = pairs.iter().filter(|(key, _)| key == name);
            let value = &values.next()?.1;
            (values.next().is_none() && !value.is_empty()).then_some(value.as_str())
        };
        if one("state")? != state {
            return None;
        }
        return one("code").map(str::to_owned);
    }
    payload
        .get("clientCode")
        .or_else(|| payload.get("client_code"))?
        .as_str()
        .filter(|code| !code.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_redirects_outside_the_callback_or_authorization() {
        let callback = "https://api.solace.test/api/mail/oauth/callback";
        for location in [
            "https://evil.test/api/mail/oauth/callback?code=secret&state=expected",
            "https://api.solace.test/elsewhere?code=secret&state=expected",
            "http://api.solace.test/api/mail/oauth/callback?code=secret&state=expected",
            "https://api.solace.test/api/mail/oauth/callback?code=secret&state=wrong",
            "https://api.solace.test/api/mail/oauth/callback?code=secret&state=expected&state=other",
            "https://api.solace.test/api/mail/oauth/callback?code=secret&code=other&state=expected",
            "https://api.solace.test/api/mail/oauth/callback?code=&state=expected",
            "https://api.solace.test/api/mail/oauth/callback?code=secret&state=expected&error=access_denied",
            "https://api.solace.test/api/mail/oauth/callback?code=secret&state=expected#fragment",
        ] {
            assert_eq!(
                authorization_code(
                    &json!({"type": "authenticated", "location": location, "clientCode": "fallback"}),
                    callback,
                    "expected"
                ),
                None
            );
        }
    }
}
