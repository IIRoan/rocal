//! `lib/avatar-storage.ts`: the private avatar bucket, which holds only WebP variants re-encoded from the uploaded crop.

use std::io::Cursor;
use std::time::Duration;

use axum::http::StatusCode;
use image::imageops::FilterType;
use image::{DynamicImage, ImageReader, Limits};
use rusty_s3::{Bucket, Credentials, S3Action, UrlStyle};
use thiserror::Error;
use tokio::task::JoinSet;

use crate::config::AvatarBucketConfig;
use crate::error::AppError;

/// Square edge lengths stored for every picture; the largest is also the upload size.
pub const VARIANT_SIZES: [u32; 5] = [32, 64, 128, 256, 512];
pub const UPLOAD_SIZE_PX: u32 = 512;
pub const INVALID_PICTURE: &str =
    "Profile picture must be a square JPEG, PNG or WebP image up to 512px.";
const WEBP_QUALITY: f32 = 80.0;
const PRESIGNED_FOR: Duration = Duration::from_secs(60);

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("Profile picture uploads are not available right now.")]
    Unavailable,
    #[error("avatar bucket {action} failed")]
    Request {
        action: &'static str,
        #[source]
        source: reqwest::Error,
    },
    #[error("avatar bucket {action} answered {status}")]
    Status {
        action: &'static str,
        status: StatusCode,
    },
    #[error("avatar bucket {action} was interrupted")]
    Interrupted { action: &'static str },
}

impl From<StorageError> for AppError {
    fn from(error: StorageError) -> Self {
        match error {
            StorageError::Unavailable => AppError::Upstream {
                status: StatusCode::SERVICE_UNAVAILABLE,
                message: error.to_string(),
            },
            other => AppError::internal(other),
        }
    }
}

/// One encoded variant, ready to store.
pub struct Variant {
    pub size: u32,
    pub bytes: Vec<u8>,
}

pub struct AvatarStorage {
    bucket: Bucket,
    credentials: Credentials,
    http: reqwest::Client,
}

fn object_key(avatar_id: &str, size: u32) -> String {
    format!("avatars/{avatar_id}/{size}.webp")
}

impl AvatarStorage {
    /// Path-style requests, as Bun's S3 client sent them; `None` when the endpoint is unusable.
    pub fn new(config: &AvatarBucketConfig, http: reqwest::Client) -> Option<Self> {
        let endpoint = url::Url::parse(&config.endpoint).ok()?;
        let bucket = Bucket::new(
            endpoint,
            UrlStyle::Path,
            config.name.clone(),
            config.region.clone(),
        )
        .ok()?;
        Some(Self {
            bucket,
            credentials: Credentials::new(&config.access_key_id, &config.secret_access_key),
            http,
        })
    }

    /// Writes every variant; a failed write is reported only once the others have settled.
    pub async fn store(&self, avatar_id: &str, variants: Vec<Variant>) -> Result<(), StorageError> {
        let requests = variants.into_iter().map(|variant| {
            let key = object_key(avatar_id, variant.size);
            let url = self
                .bucket
                .put_object(Some(&self.credentials), &key)
                .sign(PRESIGNED_FOR);
            self.http
                .put(url)
                .header(reqwest::header::CONTENT_TYPE, "image/webp")
                .body(variant.bytes)
        });
        settle("write", requests, StatusCode::is_success).await
    }

    /// One variant's bytes; `None` when the bucket has no such object.
    pub async fn read(&self, avatar_id: &str, size: u32) -> Result<Option<Vec<u8>>, StorageError> {
        let key = object_key(avatar_id, size);
        let url = self
            .bucket
            .get_object(Some(&self.credentials), &key)
            .sign(PRESIGNED_FOR);
        let failed = |source| StorageError::Request {
            action: "read",
            source,
        };
        let response = self.http.get(url).send().await.map_err(failed)?;
        match response.status() {
            StatusCode::NOT_FOUND => Ok(None),
            status if status.is_success() => {
                Ok(Some(response.bytes().await.map_err(failed)?.to_vec()))
            }
            status => Err(StorageError::Status {
                action: "read",
                status,
            }),
        }
    }

    /// Deletes every variant; missing objects are fine.
    pub async fn delete(&self, avatar_id: &str) -> Result<(), StorageError> {
        let requests = VARIANT_SIZES.map(|size| {
            let key = object_key(avatar_id, size);
            let url = self
                .bucket
                .delete_object(Some(&self.credentials), &key)
                .sign(PRESIGNED_FOR);
            self.http.delete(url)
        });
        settle("delete", requests, |status| {
            status.is_success() || *status == StatusCode::NOT_FOUND
        })
        .await
    }
}

/// Sends every request concurrently and waits for all of them, like `Promise.allSettled`.
async fn settle(
    action: &'static str,
    requests: impl IntoIterator<Item = reqwest::RequestBuilder>,
    accepted: fn(&StatusCode) -> bool,
) -> Result<(), StorageError> {
    let mut pending = JoinSet::new();
    for request in requests {
        pending.spawn(request.send());
    }
    let mut failure = None;
    while let Some(joined) = pending.join_next().await {
        let outcome = match joined {
            Ok(Ok(response)) if accepted(&response.status()) => continue,
            Ok(Ok(response)) => StorageError::Status {
                action,
                status: response.status(),
            },
            Ok(Err(source)) => StorageError::Request { action, source },
            Err(_) => StorageError::Interrupted { action },
        };
        failure.get_or_insert(outcome);
    }
    failure.map_or(Ok(()), Err)
}

/// `assertSquareImage`: a JPEG, PNG or WebP square of at most 512px, or the one validation error.
fn decode_square(source: &[u8]) -> Result<DynamicImage, AppError> {
    let invalid = || AppError::field(INVALID_PICTURE, "image");
    let mut reader = ImageReader::new(Cursor::new(source))
        .with_guessed_format()
        .map_err(|_| invalid())?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(UPLOAD_SIZE_PX);
    limits.max_image_height = Some(UPLOAD_SIZE_PX);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| invalid())?;
    if image.width() != image.height() {
        return Err(invalid());
    }
    Ok(image)
}

fn encode(image: &DynamicImage) -> Result<Vec<u8>, AppError> {
    let (width, height) = (image.width(), image.height());
    let encoded = if image.color().has_alpha() {
        let pixels = image.to_rgba8();
        webp::Encoder::from_rgba(&pixels, width, height).encode_simple(false, WEBP_QUALITY)
    } else {
        let pixels = image.to_rgb8();
        webp::Encoder::from_rgb(&pixels, width, height).encode_simple(false, WEBP_QUALITY)
    };
    encoded
        .map(|memory| memory.to_vec())
        .map_err(|_| AppError::internal("avatar encoding failed"))
}

/// Validates the crop and re-encodes it into every variant, never enlarging; the uploaded bytes are never stored.
pub async fn encode_variants(source: Vec<u8>) -> Result<Vec<Variant>, AppError> {
    tokio::task::spawn_blocking(move || {
        let image = decode_square(&source)?;
        VARIANT_SIZES
            .iter()
            .map(|&size| {
                let bytes = if size < image.width() {
                    encode(&image.resize_exact(size, size, FilterType::Lanczos3))?
                } else {
                    encode(&image)?
                };
                Ok(Variant { size, bytes })
            })
            .collect()
    })
    .await
    .map_err(AppError::internal)?
}

#[cfg(test)]
pub(crate) mod tests {
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};

    use axum::Router;
    use axum::body::Bytes;
    use axum::extract::State;
    use axum::http::{Method, Uri};
    use axum::response::{IntoResponse, Response};
    use tokio::sync::Notify;

    use super::*;

    const BUCKET: &str = "solace-test-unit";

    pub(crate) fn config(endpoint: &str) -> AvatarBucketConfig {
        AvatarBucketConfig {
            name: BUCKET.into(),
            endpoint: endpoint.into(),
            region: "auto".into(),
            access_key_id: "solace-test-key".into(),
            secret_access_key: "solace-test-secret".into(),
        }
    }

    async fn serve(app: Router) -> String {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(listener, app).await });
        format!("http://127.0.0.1:{port}")
    }

    /// An S3-compatible endpoint in memory, with switches that make writes or deletes fail.
    #[derive(Clone, Default)]
    pub(crate) struct LocalBucket {
        objects: Arc<Mutex<BTreeMap<String, Vec<u8>>>>,
        pub(crate) puts: Arc<AtomicUsize>,
        pub(crate) fail_writes_of_size: Arc<Mutex<Option<u32>>>,
        pub(crate) fail_deletes: Arc<AtomicBool>,
    }

    impl LocalBucket {
        pub(crate) async fn start(&self) -> String {
            serve(Router::new().fallback(object).with_state(self.clone())).await
        }

        /// Avatar ids with at least one stored object.
        pub(crate) fn ids(&self) -> std::collections::BTreeSet<String> {
            self.objects
                .lock()
                .unwrap()
                .keys()
                .filter_map(|key| key.split('/').nth(1).map(str::to_owned))
                .collect()
        }

        pub(crate) fn seed(&self, avatar_id: &str) {
            let mut objects = self.objects.lock().unwrap();
            for size in VARIANT_SIZES {
                objects.insert(object_key(avatar_id, size), vec![size as u8]);
            }
        }
    }

    async fn object(
        State(bucket): State<LocalBucket>,
        method: Method,
        uri: Uri,
        body: Bytes,
    ) -> Response {
        let Some(key) = uri.path().strip_prefix(&format!("/{BUCKET}/")) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        let key = key.to_owned();
        match method {
            Method::PUT => {
                bucket.puts.fetch_add(1, Ordering::SeqCst);
                let failing = *bucket.fail_writes_of_size.lock().unwrap();
                if failing.is_some_and(|size| key.ends_with(&format!("/{size}.webp"))) {
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
                bucket.objects.lock().unwrap().insert(key, body.to_vec());
                StatusCode::OK.into_response()
            }
            Method::GET => match bucket.objects.lock().unwrap().get(&key) {
                Some(bytes) => bytes.clone().into_response(),
                None => StatusCode::NOT_FOUND.into_response(),
            },
            Method::DELETE if bucket.fail_deletes.load(Ordering::SeqCst) => {
                StatusCode::SERVICE_UNAVAILABLE.into_response()
            }
            Method::DELETE => {
                bucket.objects.lock().unwrap().remove(&key);
                StatusCode::NO_CONTENT.into_response()
            }
            _ => StatusCode::METHOD_NOT_ALLOWED.into_response(),
        }
    }

    #[tokio::test]
    async fn a_failed_variant_write_waits_for_the_other_writes() {
        let release = Arc::new(Notify::new());
        let writes = Arc::new(AtomicUsize::new(0));
        let app = Router::new().fallback({
            let (release, writes) = (release.clone(), writes.clone());
            move || {
                let (release, writes) = (release.clone(), writes.clone());
                async move {
                    match writes.fetch_add(1, Ordering::SeqCst) {
                        0 => StatusCode::INTERNAL_SERVER_ERROR,
                        1 => {
                            release.notified().await;
                            StatusCode::OK
                        }
                        _ => StatusCode::OK,
                    }
                }
            }
        });
        let endpoint = serve(app).await;
        let storage = AvatarStorage::new(&config(&endpoint), reqwest::Client::new()).unwrap();
        let variants = VARIANT_SIZES
            .map(|size| Variant {
                size,
                bytes: vec![1],
            })
            .into();
        let mut store = std::pin::pin!(storage.store("avatar", variants));
        assert!(
            tokio::time::timeout(Duration::from_millis(300), &mut store)
                .await
                .is_err(),
            "the failure waits for the outstanding write"
        );
        release.notify_one();
        assert!(matches!(
            store.await,
            Err(StorageError::Status {
                action: "write",
                status: StatusCode::INTERNAL_SERVER_ERROR
            })
        ));
    }

    #[tokio::test]
    async fn variants_are_square_webp_and_never_enlarged() {
        let mut png = Vec::new();
        DynamicImage::new_rgb8(64, 64)
            .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let variants = encode_variants(png).await.unwrap();
        let edges: Vec<(u32, u32)> = variants
            .iter()
            .map(|variant| {
                let decoded = image::load_from_memory(&variant.bytes).unwrap();
                assert_eq!(&variant.bytes[8..12], b"WEBP");
                (variant.size, decoded.width())
            })
            .collect();
        assert_eq!(edges, [(32, 32), (64, 64), (128, 64), (256, 64), (512, 64)]);
        for bad in [b"hello".to_vec(), Vec::new()] {
            assert!(matches!(
                encode_variants(bad).await,
                Err(AppError::Validation { .. })
            ));
        }
    }
}
