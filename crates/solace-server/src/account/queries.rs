//! Account deletion: the rows that do not cascade from `user`.

use sea_orm::sea_query::{Expr, Func, Query};
use sea_orm::{ColumnTrait, Condition, ConnectionTrait, EntityTrait, ExprTrait, QueryFilter};

use crate::db::entities::{
    calendar_event, calendar_sharing, event_participant, invite, mail_directory_entry,
    notification_log, session, user, verification,
};
use crate::events::queries as events;
use crate::instant;

pub async fn user<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<user::Model>, sea_orm::DbErr> {
    user::Entity::find_by_id(user_id).one(db).await
}

pub async fn mailbox<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<mail_directory_entry::Model>, sea_orm::DbErr> {
    mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::UserId.eq(user_id))
        .one(db)
        .await
}

/// Shares both ways, reminder logs, invites addressed to or claimed for `emails`, exceptions, verifications and participations, then the user, whose rows cascade.
pub async fn delete_user<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    emails: &[String],
) -> Result<(), sea_orm::DbErr> {
    events::delete_exceptions_of(
        db,
        events::ids_where(Condition::all().add(calendar_event::Column::UserId.eq(user_id))),
    )
    .await?;
    // Reset tokens and passkey challenges hold the user id; one-time tokens hold a session token.
    verification::Entity::delete_many()
        .filter(
            Condition::any()
                .add(Expr::cust_with_values(
                    r#"strpos("value", $1) > 0"#,
                    [user_id],
                ))
                .add(
                    verification::Column::Value.in_subquery(
                        Query::select()
                            .column(session::Column::Token)
                            .from(session::Entity)
                            .and_where(session::Column::UserId.eq(user_id))
                            .to_owned(),
                    ),
                ),
        )
        .exec(db)
        .await?;
    release_participations(db, user_id, emails).await?;
    calendar_sharing::Entity::delete_many()
        .filter(
            Condition::any()
                .add(calendar_sharing::Column::SharedWith.eq(user_id))
                .add(calendar_sharing::Column::SharedBy.eq(user_id)),
        )
        .exec(db)
        .await?;
    notification_log::Entity::delete_many()
        .filter(notification_log::Column::UserId.eq(user_id))
        .exec(db)
        .await?;
    if !emails.is_empty() {
        invite::Entity::delete_many()
            .filter(
                Condition::any()
                    .add(invite::Column::Email.is_in(emails))
                    .add(invite::Column::ClaimedForEmail.is_in(emails)),
            )
            .exec(db)
            .await?;
    }
    user::Entity::delete_by_id(user_id)
        .exec(db)
        .await
        .map(|_| ())
}

/// On other users' events the address the organizer typed stays; the link, the RSVP and the display name (which may come from this profile) go.
async fn release_participations<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    emails: &[String],
) -> Result<(), sea_orm::DbErr> {
    use event_participant::Column;
    let mut theirs = Condition::any().add(Column::UserId.eq(user_id));
    if !emails.is_empty() {
        theirs = theirs.add(Func::lower(Expr::col(Column::Email)).is_in(emails.to_vec()));
    }
    event_participant::Entity::update_many()
        .col_expr(Column::UserId, Expr::value(Option::<String>::None))
        .col_expr(Column::DisplayName, Expr::value(Option::<String>::None))
        .col_expr(
            Column::Status,
            Expr::cust("CASE WHEN role = 'organizer' THEN 'accepted' ELSE 'pending' END"),
        )
        .col_expr(Column::UpdatedAt, Expr::value(instant::now()))
        .filter(theirs)
        .exec(db)
        .await
        .map(|_| ())
}
