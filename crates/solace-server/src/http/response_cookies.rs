//! Set-Cookie values collected while a request runs (session renewal, clears) and appended to whatever response it ends with.

use std::sync::{Arc, Mutex};

use axum::extract::Request;
use axum::http::{HeaderValue, header};
use axum::middleware::Next;
use axum::response::Response;

#[derive(Clone, Default)]
pub struct ResponseCookies(Arc<Mutex<Vec<String>>>);

impl ResponseCookies {
    pub fn extend(&self, cookies: impl IntoIterator<Item = String>) {
        if let Ok(mut collected) = self.0.lock() {
            collected.extend(cookies);
        }
    }

    fn take(&self) -> Vec<String> {
        self.0
            .lock()
            .map(|mut c| std::mem::take(&mut *c))
            .unwrap_or_default()
    }
}

pub async fn middleware(mut request: Request, next: Next) -> Response {
    let cookies = ResponseCookies::default();
    request.extensions_mut().insert(cookies.clone());
    let mut response = next.run(request).await;
    for cookie in cookies.take() {
        if let Ok(value) = HeaderValue::from_str(&cookie) {
            response.headers_mut().append(header::SET_COOKIE, value);
        }
    }
    response
}
