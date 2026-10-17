//! `probeStalwartReachable`: one unauthenticated session GET; only 200 or 401 prove Stalwart answered, since the gate answers 404.

use std::time::Duration;

use reqwest::{Client, RequestBuilder};

use super::gate::StalwartGate;

const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// `Ok` when Stalwart answered, else the upstream status (0 when the connection failed).
pub async fn probe(client: &Client, base_url: &str, gate: &StalwartGate) -> Result<(), u16> {
    match request(client, base_url, gate).send().await {
        Ok(response) if response.status().is_success() || response.status().as_u16() == 401 => {
            Ok(())
        }
        Ok(response) => Err(response.status().as_u16()),
        Err(_) => Err(0),
    }
}

/// Use a client that does not follow redirects: a redirect is not Stalwart answering.
fn request(client: &Client, base_url: &str, gate: &StalwartGate) -> RequestBuilder {
    let url = format!("{}/jmap/session", base_url.trim_end_matches('/'));
    gate.apply(client.get(&url).timeout(PROBE_TIMEOUT), &url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    fn no_redirects() -> Client {
        Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
    }

    /// A real local server answering every request with `status`.
    async fn server(status: StatusCode) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let app = axum::Router::new().fallback(move || async move {
            if status.is_redirection() {
                (status, [("location", "http://127.0.0.1:9/elsewhere")]).into_response()
            } else {
                status.into_response()
            }
        });
        tokio::spawn(async move { axum::serve(listener, app).await });
        format!("http://{address}")
    }

    fn no_gate() -> StalwartGate {
        StalwartGate::new("http://127.0.0.1", None)
    }

    #[tokio::test]
    async fn treats_401_as_reachable() {
        let base = server(StatusCode::UNAUTHORIZED).await;
        assert_eq!(probe(&no_redirects(), &base, &no_gate()).await, Ok(()));
        let base = server(StatusCode::OK).await;
        assert_eq!(
            probe(&no_redirects(), &format!("{base}/"), &no_gate()).await,
            Ok(())
        );
    }

    #[tokio::test]
    async fn does_not_follow_redirects() {
        let base = server(StatusCode::FOUND).await;
        assert_eq!(probe(&no_redirects(), &base, &no_gate()).await, Err(302));
    }

    #[tokio::test]
    async fn fails_on_a_gate_404() {
        let base = server(StatusCode::NOT_FOUND).await;
        assert_eq!(probe(&no_redirects(), &base, &no_gate()).await, Err(404));
    }

    #[tokio::test]
    async fn fails_on_upstream_5xx() {
        let base = server(StatusCode::BAD_GATEWAY).await;
        assert_eq!(probe(&no_redirects(), &base, &no_gate()).await, Err(502));
    }

    #[tokio::test]
    async fn fails_when_the_connection_errors() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        assert_eq!(
            probe(&no_redirects(), &format!("http://{address}"), &no_gate()).await,
            Err(0)
        );
    }

    #[test]
    fn sends_the_gate_key_to_https() {
        let gate = StalwartGate::new("https://stalwart.test", Some("solace-test-gate"));
        let built = request(&no_redirects(), "https://stalwart.test/", &gate)
            .build()
            .unwrap();
        assert_eq!(built.url().as_str(), "https://stalwart.test/jmap/session");
        assert_eq!(
            built
                .headers()
                .get(super::super::gate::GATE_HEADER)
                .and_then(|v| v.to_str().ok()),
            Some("solace-test-gate")
        );
    }
}
