//! Set-Cookie values collected while a request runs (session renewal, clears) and appended to whatever response it ends with.

use std::sync::{Arc, Mutex};

use axum::extract::{FromRequestParts, Request};
use axum::http::request::Parts;
use axum::http::{HeaderValue, header};
use axum::middleware::Next;
use axum::response::Response;

#[derive(Clone, Default)]
pub struct ResponseCookies(Arc<Mutex<Vec<String>>>);

impl ResponseCookies {
    pub fn push(&self, cookie: String) {
        if let Ok(mut cookies) = self.0.lock() {
            cookies.push(cookie);
        }
    }

    pub fn extend(&self, cookies: impl IntoIterator<Item = String>) {
        for cookie in cookies {
            self.push(cookie);
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

impl<S: Send + Sync> FromRequestParts<S> for ResponseCookies {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(parts.extensions.get::<Self>().cloned().unwrap_or_default())
    }
}
