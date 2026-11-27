import React, { useState } from "react";
import { Alert, StyleSheet, type TextStyle } from "react-native";
import {
  EMPTY_MAIL_SIGNATURE_DRAFT,
  MAIL_SIGNATURES_DESCRIPTION,
  MAIL_SIGNATURE_LIMITS,
  deleteMailSignature,
  getMailSignatureDefaultId,
  mailSignatureToDraft,
  saveMailSignature,
  setMailSignatureDefault,
  validateMailSignatureDraft,
  mailSignaturePreview,
  type MailSignature,
  type MailSignatureDraft,
  type MailSignatureKind,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  SettingsPage,
  useSettingsBack,
  useSettingsNavigator,
} from "@workspace/native-core/components/settings/SettingsPage";
import { SheetSubPage } from "@workspace/native-core/components/sheet/SheetPageStack";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useMailComposeSettings } from "../../../hooks/use-mail-settings";
import { useMailAccount, useMailRuntime } from "../../../lib/mail/use-mail";
import type { JmapIdentity } from "../../../lib/mail/types";
import { EDIT_SIGNATURE_PREFIX, NEW_SIGNATURE_PAGE, SIGNATURE_DEFAULTS_PREFIX } from "../../../lib/mail/mail-settings-pages";

const NO_IDENTITIES: JmapIdentity[] = [];

const DEFAULT_KINDS: { kind: MailSignatureKind; label: string }[] = [
  { kind: "newMessage", label: "New messages" },
  { kind: "replyForward", label: "Replies and forwards" },
];

function useSignatureIdentities(): JmapIdentity[] {
  const provisioned = useMailAccount().data?.provisioned ?? false;
  return useMailRuntime(provisioned).data?.pickerIdentities ?? NO_IDENTITIES;
}

function signatureName(signatures: readonly MailSignature[], id: string | null): string {
  return signatures.find((signature) => signature.id === id)?.name ?? "None";
}

export function MailSignaturePage({ pageId }: { pageId: string }) {
  if (pageId.startsWith(SIGNATURE_DEFAULTS_PREFIX)) {
    return <SignatureDefaultsPage identityId={pageId.slice(SIGNATURE_DEFAULTS_PREFIX.length)} />;
  }
  const signatureId = pageId.startsWith(EDIT_SIGNATURE_PREFIX)
    ? pageId.slice(EDIT_SIGNATURE_PREFIX.length)
    : null;
  return (
    <SheetSubPage
      title={signatureId ? "Edit signature" : "New signature"}
      backLabel="Back to signatures"
    >
      <MailSignatureEditor signatureId={signatureId} />
    </SheetSubPage>
  );
}

export function MailSignaturesSettingsContent() {
  const { settings, isLoaded } = useMailComposeSettings();
  const identities = useSignatureIdentities();
  const navigate = useSettingsNavigator();
  const signatures = settings.signatures;
  const full = signatures.length >= MAIL_SIGNATURE_LIMITS.count;

  if (!isLoaded) {
    return (
      <SettingsPage title="Signatures">
        <SheetCenteredState loading message="Loading signatures…" />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Signatures">
      <SheetScroll>
        <SheetSection
          title="Your signatures"
          footer={
            signatures.length === 0
              ? `No signatures yet. ${MAIL_SIGNATURES_DESCRIPTION}`
              : MAIL_SIGNATURES_DESCRIPTION
          }
        >
          {signatures.length > 0 ? (
            <SheetGroup>
              {signatures.map((signature) => (
                <SheetItem
                  key={signature.id}
                  icon="edit-3"
                  label={signature.name}
                  detail={mailSignaturePreview(signature)}
                  chevron
                  onPress={() => navigate(`${EDIT_SIGNATURE_PREFIX}${signature.id}`)}
                  accessibilityLabel={`Edit ${signature.name}`}
                />
              ))}
            </SheetGroup>
          ) : null}
        </SheetSection>
        <SheetButton
          label="New signature"
          icon="plus"
          variant="secondary"
          disabled={full}
          onPress={() => navigate(NEW_SIGNATURE_PAGE)}
        />
        {full ? (
          <SheetMessage text={`You can keep up to ${MAIL_SIGNATURE_LIMITS.count} signatures.`} />
        ) : null}
        {signatures.length > 0 && identities.length > 0 ? (
          <SheetSection
            title="Defaults"
            footer="The signature each address starts new messages and replies with."
          >
            <SheetGroup>
              {identities.map((identity) => (
                <SheetItem
                  key={identity.id}
                  icon="at-sign"
                  label={identity.email}
                  detail={DEFAULT_KINDS.map(
                    ({ kind, label }) =>
                      `${label}: ${signatureName(signatures, getMailSignatureDefaultId(settings.signatureDefaults, identity.id, kind))}`,
                  ).join(" · ")}
                  chevron
                  onPress={() => navigate(`${SIGNATURE_DEFAULTS_PREFIX}${identity.id}`)}
                  accessibilityLabel={`Default signatures for ${identity.email}`}
                />
              ))}
            </SheetGroup>
          </SheetSection>
        ) : null}
      </SheetScroll>
    </SettingsPage>
  );
}

function SignatureDefaultsPage({ identityId }: { identityId: string }) {
  const { settings, isLoaded, updateSettings } = useMailComposeSettings();
  const identities = useSignatureIdentities();
  const identity = identities.find((entry) => entry.id === identityId);

  const choose = (kind: MailSignatureKind, signatureId: string | null) =>
    updateSettings({
      signatureDefaults: setMailSignatureDefault(
        settings.signatureDefaults,
        identityId,
        kind,
        signatureId,
      ),
    });

  return (
    <SheetSubPage title={identity?.email ?? "Default signatures"} backLabel="Back to signatures">
      {!isLoaded ? (
        <SheetCenteredState loading message="Loading signatures…" />
      ) : (
        <SheetScroll>
          {DEFAULT_KINDS.map(({ kind, label }) => {
            const current = getMailSignatureDefaultId(settings.signatureDefaults, identityId, kind);
            const selected = settings.signatures.some((signature) => signature.id === current)
              ? current
              : null;
            return (
              <SheetSection key={kind} title={label}>
                <SheetGroup>
                  {[{ id: null, name: "None" }, ...settings.signatures].map((option) => (
                    <SheetItem
                      key={option.id ?? "none"}
                      label={option.name}
                      checked={selected === option.id}
                      onPress={() => choose(kind, option.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected === option.id }}
                    />
                  ))}
                </SheetGroup>
              </SheetSection>
            );
          })}
        </SheetScroll>
      )}
    </SheetSubPage>
  );
}

function MailSignatureEditor({ signatureId }: { signatureId: string | null }) {
  const { settings, isLoaded } = useMailComposeSettings();
  const existing = signatureId
    ? settings.signatures.find((signature) => signature.id === signatureId) ?? null
    : null;

  if (!isLoaded) {
    return <SheetCenteredState loading message="Loading signature…" />;
  }
  if (signatureId && !existing) {
    return <SheetCenteredState message="This signature was deleted." />;
  }
  return (
    <MailSignatureForm
      signatureId={signatureId}
      initial={existing ? mailSignatureToDraft(existing) : EMPTY_MAIL_SIGNATURE_DRAFT}
    />
  );
}

function MailSignatureForm({
  signatureId,
  initial,
}: {
  signatureId: string | null;
  initial: MailSignatureDraft;
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { settings, updateSettings } = useMailComposeSettings();
  const identities = useSignatureIdentities();
  const back = useSettingsBack();
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const signatures = settings.signatures;
  const errors = submitted ? validateMailSignatureDraft(draft, signatures, signatureId) : {};
  const patch = (next: Partial<MailSignatureDraft>) =>
    setDraft((current) => ({ ...current, ...next }));

  const save = () => {
    setSubmitted(true);
    if (Object.keys(validateMailSignatureDraft(draft, signatures, signatureId)).length > 0) return;
    const saved = saveMailSignature(
      settings,
      draft,
      signatureId,
      identities.map((identity) => identity.id),
    );
    updateSettings({ signatures: saved.signatures, signatureDefaults: saved.signatureDefaults });
    back();
  };

  const confirmDelete = () => {
    if (!signatureId) return;
    Alert.alert("Delete signature", `Delete “${initial.name}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          updateSettings(deleteMailSignature(settings, signatureId));
          back();
        },
      },
    ]);
  };

  return (
    <SheetScroll>
      <SheetSection title="Name">
        <SheetGroup>
          <SheetTextField
            value={draft.name}
            onChangeText={(name) => patch({ name })}
            placeholder="Work"
            maxLength={MAIL_SIGNATURE_LIMITS.name}
            accessibilityLabel="Signature name"
          />
        </SheetGroup>
        {errors.name ? <SheetMessage tone="destructive" text={errors.name} /> : null}
      </SheetSection>

      <SheetSection title="Text">
        <SheetGroup>
          <SheetTextField
            value={draft.body}
            onChangeText={(body) => patch({ body })}
            placeholder={"Kind regards,\nAlex"}
            multiline
            maxLength={MAIL_SIGNATURE_LIMITS.body}
            style={styles.body}
            accessibilityLabel="Signature text"
          />
        </SheetGroup>
        {errors.body ? <SheetMessage tone="destructive" text={errors.body} /> : null}
      </SheetSection>

      {errors.form ? <SheetMessage tone="destructive" text={errors.form} /> : null}
      <SheetButton label="Save signature" onPress={save} />
      {signatureId ? (
        <SheetButton label="Delete signature" variant="destructive" onPress={confirmDelete} />
      ) : null}
    </SheetScroll>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    body: {
      minHeight: theme.spacing["10"] * 3,
      textAlignVertical: "top",
    } satisfies TextStyle,
  });
}
