import type { LucideIcon } from "lucide-react";
import {
  InvitationBanner,
  InvitationBannerActions,
  InvitationBannerHeader,
  InvitationBannerMeta,
  InvitationBannerMetaItem,
  type InvitationBannerVariant,
} from "@workspace/ui/components/ui/invitation-banner";
import { cn } from "@workspace/ui/lib/utils";

export type MailNotificationMetaItem = {
  icon?: LucideIcon;
  children: React.ReactNode;
};

export type MailNotificationBannerProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: MailNotificationMetaItem[];
  actions?: React.ReactNode;
  headerAction?: React.ReactNode;
  variant?: InvitationBannerVariant;
  inactive?: boolean;
  className?: string;
};

export function MailNotificationBanner({
  title,
  description,
  meta,
  actions,
  headerAction,
  variant = "invitation",
  inactive = false,
  className,
}: MailNotificationBannerProps) {
  const hasMeta = Boolean(meta?.length);

  return (
    <InvitationBanner
      variant={variant}
      inactive={inactive}
      className={cn("mb-0 rounded-b-none", className)}
    >
      <InvitationBannerHeader
        title={title}
        description={description}
        action={headerAction}
      />
      {hasMeta ? (
        <InvitationBannerMeta>
          {meta?.map((item, index) => (
            <InvitationBannerMetaItem key={index} icon={item.icon}>
              {item.children}
            </InvitationBannerMetaItem>
          ))}
        </InvitationBannerMeta>
      ) : null}
      {actions ? <InvitationBannerActions>{actions}</InvitationBannerActions> : null}
    </InvitationBanner>
  );
}
