//! Avatar changes (`profile.service.ts`, `avatar-updates.ts`): the reserved upload slot is committed before bucket writes, the replacement before the old picture is deleted, and at most two pictures exist per account.

use std::future::Future;
use std::time::Duration;

use axum::http::HeaderValue;
use base64::Engine;
use base64::alphabet;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use rand::RngExt;
use sea_orm::{ConnectionTrait, TransactionTrait};
use solace_api_types::profiles::AvatarResponse;

use super::queries;
use super::service::uploaded_avatar_path;
use crate::db::entities::user;
use crate::error::AppError;
use crate::integrations::storage::{
    self, AvatarStorage, StorageError, UPLOAD_SIZE_PX, VARIANT_SIZES,
};
use crate::state::AppState;
use crate::telemetry::redact_pii;

/// Prisma's interactive-transaction timeout, which bounds how long a slow bucket holds the row lock.
const TRANSACTION_TIMEOUT: Duration = Duration::from_secs(30);

/// `Buffer.from(image, "base64")`: whitespace, URL-safe letters and missing padding are tolerated; garbage decodes to nothing.
const LENIENT_BASE64: GeneralPurpose = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

fn decode_upload(image: &str) -> Vec<u8> {
    let normalized: String = image
        .chars()
        .filter(|c| !c.is_ascii_whitespace())
        .map(|c| match c {
            '-' => '+',
            '_' => '/',
            other => other,
        })
        .collect();
    LENIENT_BASE64.decode(normalized).unwrap_or_default()
}

/// Picture bytes and their content type.
pub struct Picture {
    pub body: Vec<u8>,
    pub content_type: HeaderValue,
}

fn bucket(state: &AppState) -> Result<&AvatarStorage, AppError> {
    state
        .avatar_storage
        .as_deref()
        .ok_or_else(|| StorageError::Unavailable.into())
}

async fn within_transaction_timeout<T>(
    work: impl Future<Output = Result<T, AppError>>,
) -> Result<T, AppError> {
    tokio::time::timeout(TRANSACTION_TIMEOUT, work)
        .await
        .map_err(|_| AppError::internal("avatar transaction timed out"))?
}

/// `solaceAvatarVariantSize`: the smallest stored variant that still looks sharp at `pixels`.
fn variant_size(pixels: u32) -> u32 {
    VARIANT_SIZES
        .into_iter()
        .find(|size| *size >= pixels)
        .unwrap_or(UPLOAD_SIZE_PX)
}

async fn read_uploaded(
    state: &AppState,
    avatar_id: &str,
    size: Option<u32>,
) -> Result<Option<Picture>, AppError> {
    let size = variant_size(size.unwrap_or(UPLOAD_SIZE_PX));
    Ok(bucket(state)?
        .read(avatar_id, size)
        .await?
        .map(|body| Picture {
            body,
            content_type: HeaderValue::from_static("image/webp"),
        }))
}

/// `streamUploadedAvatar`.
pub async fn stream_uploaded(
    state: &AppState,
    avatar_id: &str,
    size: Option<u32>,
) -> Result<Option<Picture>, AppError> {
    if !queries::avatar_attached(&state.db, avatar_id).await? {
        return Ok(None);
    }
    read_uploaded(state, avatar_id, size).await
}

/// `deletePendingAvatar`: deletes the reserved or retired picture's objects, then frees the slot.
async fn delete_pending<C: ConnectionTrait>(
    state: &AppState,
    db: &C,
    locked: &user::Model,
) -> Result<(), AppError> {
    let Some(pending) = &locked.pending_avatar_id else {
        return Ok(());
    };
    bucket(state)?.delete(pending).await?;
    queries::set_pending(db, &locked.id, None).await?;
    Ok(())
}

/// `cleanupPendingAvatar`: a failure keeps the slot for the next change and never fails a committed one.
async fn cleanup_pending(state: &AppState, user_id: &str, expected: Option<&str>) {
    let Some(expected) = expected else {
        return;
    };
    let outcome = within_transaction_timeout(async {
        let transaction = state.db.begin().await?;
        let locked = queries::lock(&transaction, user_id).await?;
        // A newer change may already have used this slot.
        if locked.pending_avatar_id.as_deref() == Some(expected) {
            delete_pending(state, &transaction, &locked).await?;
        }
        transaction.commit().await?;
        Ok(())
    })
    .await;
    if let Err(error) = outcome {
        tracing::warn!(error = %redact_pii(&error.to_string()), "Profile picture cleanup deferred");
    }
}

/// `uploadAvatar`: reserve the id, store the variants and switch under the lock, then delete the previous picture.
pub async fn upload(
    state: &AppState,
    user_id: &str,
    image: &str,
) -> Result<AvatarResponse, AppError> {
    let avatar_id = URL_SAFE_NO_PAD.encode(rand::rng().random::<[u8; 16]>());
    let path = uploaded_avatar_path(&avatar_id);
    // The reservation commits before any bucket write, so even an interrupted upload stays discoverable.
    within_transaction_timeout(async {
        let transaction = state.db.begin().await?;
        let locked = queries::lock(&transaction, user_id).await?;
        delete_pending(state, &transaction, &locked).await?;
        queries::set_pending(&transaction, user_id, Some(&avatar_id)).await?;
        transaction.commit().await?;
        Ok(())
    })
    .await?;
    let switched = within_transaction_timeout(async {
        let transaction = state.db.begin().await?;
        let locked = queries::lock(&transaction, user_id).await?;
        if locked.pending_avatar_id.as_deref() != Some(avatar_id.as_str()) {
            return Err(AppError::Conflict(
                "Profile picture changed. Please try again.".into(),
            ));
        }
        let variants = storage::encode_variants(decode_upload(image)).await?;
        bucket(state)?.store(&avatar_id, variants).await?;
        queries::attach_upload(
            &transaction,
            user_id,
            &avatar_id,
            &path,
            locked.avatar_id.clone(),
        )
        .await?;
        transaction.commit().await?;
        Ok(locked.avatar_id)
    })
    .await;
    let retired = match switched {
        Ok(retired) => retired,
        Err(error) => {
            cleanup_pending(state, user_id, Some(&avatar_id)).await;
            return Err(error);
        }
    };
    cleanup_pending(state, user_id, retired.as_deref()).await;
    Ok(AvatarResponse { image: Some(path) })
}

/// `removeAvatar`: the picture is detached in the transaction and its objects deleted after the commit.
pub async fn remove(state: &AppState, user_id: &str) -> Result<AvatarResponse, AppError> {
    let retired = within_transaction_timeout(async {
        let transaction = state.db.begin().await?;
        let locked = queries::lock(&transaction, user_id).await?;
        let retired = if locked.image.is_none() {
            locked.pending_avatar_id.clone()
        } else {
            delete_pending(state, &transaction, &locked).await?;
            queries::detach(&transaction, user_id, locked.avatar_id.clone()).await?;
            locked.avatar_id.clone()
        };
        transaction.commit().await?;
        Ok(retired)
    })
    .await?;
    cleanup_pending(state, user_id, retired.as_deref()).await;
    Ok(AvatarResponse { image: None })
}

/// `deleteCurrentAvatar`, for account deletion: every stored object of the user, under the row lock of `db`'s transaction.
pub async fn delete_current<C: ConnectionTrait>(
    state: &AppState,
    db: &C,
    user_id: &str,
) -> Result<(), AppError> {
    let locked = queries::lock(db, user_id).await?;
    delete_pending(state, db, &locked).await?;
    if let Some(avatar_id) = &locked.avatar_id {
        bucket(state)?.delete(avatar_id).await?;
    }
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use std::collections::BTreeSet;
    use std::sync::atomic::Ordering;

    use image::DynamicImage;
    use sea_orm::{ConnectionTrait, Statement};

    use super::*;
    use crate::config::Config;
    use crate::db::scratch::ScratchDatabase;
    use crate::integrations::storage::tests::{LocalBucket, config as bucket_config};

    const USER: &str = "avatar-test-user";
    const PREVIOUS: &str = "previous";

    /// Raises inside the transaction that changes `avatar_id`, at the update or at commit, while the fault row exists.
    const FAULTS: &str = r#"
        CREATE TABLE avatar_fault (kind text PRIMARY KEY);
        CREATE FUNCTION avatar_fault() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM avatar_fault WHERE kind = TG_ARGV[0]) THEN
            RAISE EXCEPTION '% failed', TG_ARGV[0];
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER avatar_update_fault BEFORE UPDATE ON "user" FOR EACH ROW
          WHEN (NEW.avatar_id IS DISTINCT FROM OLD.avatar_id) EXECUTE FUNCTION avatar_fault('update');
        CREATE CONSTRAINT TRIGGER avatar_commit_fault AFTER UPDATE ON "user"
          DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
          WHEN (NEW.avatar_id IS DISTINCT FROM OLD.avatar_id) EXECUTE FUNCTION avatar_fault('commit');
    "#;

    struct Fixture {
        state: AppState,
        bucket: LocalBucket,
        _database: ScratchDatabase,
    }

    /// App state on `database` with `bucket`, started here, as the avatar bucket.
    pub(crate) async fn state_with_bucket(
        database: &ScratchDatabase,
        bucket: &LocalBucket,
    ) -> AppState {
        let endpoint = bucket.start().await;
        let bucket = bucket_config(&endpoint);
        let config = Config::for_tests(&[
            ("DATABASE_URL", &database.url),
            ("AVATAR_BUCKET", &bucket.name),
            ("AVATAR_BUCKET_ENDPOINT", &bucket.endpoint),
            ("AVATAR_BUCKET_ACCESS_KEY_ID", &bucket.access_key_id),
            ("AVATAR_BUCKET_SECRET_ACCESS_KEY", &bucket.secret_access_key),
        ]);
        AppState::new(config, database.db.clone()).unwrap()
    }

    /// A user whose current picture is `previous`, stored in a local bucket, on a fresh database.
    async fn fixture() -> Fixture {
        let database = ScratchDatabase::create().await;
        let bucket = LocalBucket::default();
        let state = state_with_bucket(&database, &bucket).await;
        state
            .db
            .execute_unprepared(&format!(
                "INSERT INTO \"user\" (id, name, email, email_verified, avatar_id, image, created_at, updated_at) \
                 VALUES ('{USER}', 'Avatar Test', 'avatar-test@example.com', true, '{PREVIOUS}', '/api/profiles/avatars/{PREVIOUS}', now(), now())"
            ))
            .await
            .unwrap();
        state.db.execute_unprepared(FAULTS).await.unwrap();
        bucket.seed(PREVIOUS);
        Fixture {
            state,
            bucket,
            _database: database,
        }
    }

    impl Fixture {
        async fn fault(&self, kind: &str) {
            self.state
                .db
                .execute_unprepared(&format!("INSERT INTO avatar_fault VALUES ('{kind}')"))
                .await
                .unwrap();
        }

        /// `(avatar_id, pending_avatar_id, image)`.
        async fn row(&self) -> (Option<String>, Option<String>, Option<String>) {
            let row = self
                .state
                .db
                .query_one_raw(Statement::from_string(
                    self.state.db.get_database_backend(),
                    format!("SELECT avatar_id, pending_avatar_id, image FROM \"user\" WHERE id = '{USER}'"),
                ))
                .await
                .unwrap()
                .unwrap();
            (
                row.try_get("", "avatar_id").unwrap(),
                row.try_get("", "pending_avatar_id").unwrap(),
                row.try_get("", "image").unwrap(),
            )
        }

        async fn upload(&self) -> Result<AvatarResponse, AppError> {
            upload(&self.state, USER, &picture()).await
        }

        fn stored(&self) -> BTreeSet<String> {
            self.bucket.ids()
        }

        fn fail_writes(&self) {
            *self.bucket.fail_writes_of_size.lock().unwrap() = Some(512);
        }

        fn fail_deletes(&self, failing: bool) {
            self.bucket.fail_deletes.store(failing, Ordering::SeqCst);
        }
    }

    fn picture() -> String {
        let mut png = Vec::new();
        DynamicImage::new_rgb8(8, 8)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        base64::engine::general_purpose::STANDARD.encode(png)
    }

    fn failed_with(result: Result<AvatarResponse, AppError>, needle: &str) {
        match result {
            Err(AppError::Internal(message)) => assert!(message.contains(needle), "{message}"),
            other => panic!("expected an internal error mentioning {needle}, got {other:?}"),
        }
    }

    fn previous_only() -> BTreeSet<String> {
        BTreeSet::from([PREVIOUS.to_owned()])
    }

    #[test]
    fn uploads_decode_like_node_buffers() {
        assert_eq!(decode_upload("aGVs\nbG8"), b"hello");
        assert_eq!(decode_upload("-_8="), [0xfb, 0xff]);
        assert!(decode_upload("!!!!").is_empty());
    }

    #[tokio::test]
    async fn partial_variant_writes_are_cleaned_and_the_current_picture_kept() {
        let fixture = fixture().await;
        fixture.fail_writes();
        failed_with(fixture.upload().await, "write");
        assert_eq!(fixture.row().await.0.as_deref(), Some(PREVIOUS));
        assert_eq!(fixture.row().await.1, None);
        assert_eq!(fixture.stored(), previous_only());
    }

    #[tokio::test]
    async fn a_failed_commit_cleans_the_replacement() {
        let fixture = fixture().await;
        fixture.fault("commit").await;
        failed_with(fixture.upload().await, "commit failed");
        assert_eq!(fixture.row().await.0.as_deref(), Some(PREVIOUS));
        assert_eq!(fixture.stored(), previous_only());
    }

    #[tokio::test]
    async fn a_failed_database_update_keeps_the_current_picture() {
        let fixture = fixture().await;
        fixture.fault("update").await;
        failed_with(fixture.upload().await, "update failed");
        assert_eq!(
            fixture.row().await,
            (
                Some(PREVIOUS.into()),
                None,
                Some(format!("/api/profiles/avatars/{PREVIOUS}"))
            )
        );
        assert_eq!(fixture.stored(), previous_only());
    }

    #[tokio::test]
    async fn failed_cleanup_blocks_a_third_picture_until_it_succeeds() {
        let fixture = fixture().await;
        fixture.fail_deletes(true);
        let first = fixture.upload().await.unwrap().image.unwrap();
        let first_id = first
            .trim_start_matches("/api/profiles/avatars/")
            .to_owned();
        assert_eq!(fixture.row().await.1.as_deref(), Some(PREVIOUS));
        assert_eq!(fixture.stored().len(), 2);
        let writes = fixture.bucket.puts.load(Ordering::SeqCst);
        failed_with(fixture.upload().await, "delete");
        assert_eq!(
            fixture.bucket.puts.load(Ordering::SeqCst),
            writes,
            "no third picture is written"
        );
        fixture.fail_deletes(false);
        fixture.upload().await.unwrap();
        let (current, pending, _) = fixture.row().await;
        let current = current.unwrap();
        assert_ne!(current, first_id);
        assert_eq!(pending, None);
        assert_eq!(fixture.stored(), BTreeSet::from([current]));
    }

    #[tokio::test]
    async fn failed_cleanup_is_remembered_without_masking_the_upload_error() {
        let fixture = fixture().await;
        fixture.fail_writes();
        fixture.fail_deletes(true);
        failed_with(fixture.upload().await, "write");
        let (current, pending, _) = fixture.row().await;
        assert_eq!(current.as_deref(), Some(PREVIOUS));
        assert!(
            pending.is_some(),
            "the failed upload's slot is kept for cleanup"
        );
        assert_eq!(fixture.stored().len(), 2);
        let writes = fixture.bucket.puts.load(Ordering::SeqCst);
        failed_with(fixture.upload().await, "delete");
        assert_eq!(fixture.bucket.puts.load(Ordering::SeqCst), writes);
    }

    #[tokio::test]
    async fn a_failed_removal_commit_keeps_the_current_objects() {
        let fixture = fixture().await;
        fixture.fault("commit").await;
        assert!(remove(&fixture.state, USER).await.is_err());
        assert_eq!(fixture.row().await.0.as_deref(), Some(PREVIOUS));
        assert_eq!(fixture.stored(), previous_only());
    }

    #[tokio::test]
    async fn removal_keeps_the_cleanup_slot_when_storage_is_down() {
        let fixture = fixture().await;
        fixture.fail_deletes(true);
        remove(&fixture.state, USER).await.unwrap();
        assert_eq!(fixture.row().await, (None, Some(PREVIOUS.into()), None));
        fixture.fail_deletes(false);
        remove(&fixture.state, USER).await.unwrap();
        assert_eq!(fixture.row().await, (None, None, None));
        assert!(fixture.stored().is_empty());
    }
}
