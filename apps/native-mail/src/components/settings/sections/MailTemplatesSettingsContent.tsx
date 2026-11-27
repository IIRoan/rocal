import React, { useState } from "react";
import { Alert, StyleSheet, type TextStyle } from "react-native";
import {
  EMPTY_MAIL_TEMPLATE_DRAFT,
  MAIL_TEMPLATES_DESCRIPTION,
  MAIL_TEMPLATE_LIMITS,
  deleteMailTemplate,
  mailTemplateToDraft,
  saveMailTemplate,
  validateMailTemplateDraft,
  mailTemplatePreview,
  type MailTemplateDraft,
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
import { EDIT_TEMPLATE_PREFIX, NEW_TEMPLATE_PAGE } from "../../../lib/mail/mail-settings-pages";


export function MailTemplatePage({ pageId }: { pageId: string }) {
  const templateId = pageId.startsWith(EDIT_TEMPLATE_PREFIX)
    ? pageId.slice(EDIT_TEMPLATE_PREFIX.length)
    : null;
  return (
    <SheetSubPage
      title={templateId ? "Edit template" : "New template"}
      backLabel="Back to templates"
    >
      <MailTemplateEditor templateId={templateId} />
    </SheetSubPage>
  );
}

export function MailTemplatesSettingsContent() {
  const { settings, isLoaded } = useMailComposeSettings();
  const navigate = useSettingsNavigator();
  const templates = settings.templates;
  const full = templates.length >= MAIL_TEMPLATE_LIMITS.count;

  if (!isLoaded) {
    return (
      <SettingsPage title="Templates">
        <SheetCenteredState loading message="Loading templates…" />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Templates">
      <SheetScroll>
        <SheetSection
          title="Your templates"
          footer={templates.length === 0 ? `No templates yet. ${MAIL_TEMPLATES_DESCRIPTION}` : MAIL_TEMPLATES_DESCRIPTION}
        >
          {templates.length > 0 ? (
            <SheetGroup>
              {templates.map((template) => (
                <SheetItem
                  key={template.id}
                  icon="file-text"
                  label={template.name}
                  detail={mailTemplatePreview(template)}
                  chevron
                  onPress={() => navigate(`${EDIT_TEMPLATE_PREFIX}${template.id}`)}
                  accessibilityLabel={`Edit ${template.name}`}
                />
              ))}
            </SheetGroup>
          ) : null}
        </SheetSection>
        <SheetButton
          label="New template"
          icon="plus"
          variant="secondary"
          disabled={full}
          onPress={() => navigate(NEW_TEMPLATE_PAGE)}
        />
        {full ? (
          <SheetMessage text={`You can keep up to ${MAIL_TEMPLATE_LIMITS.count} templates.`} />
        ) : null}
      </SheetScroll>
    </SettingsPage>
  );
}

function MailTemplateEditor({ templateId }: { templateId: string | null }) {
  const { settings, isLoaded } = useMailComposeSettings();
  const existing = templateId
    ? settings.templates.find((template) => template.id === templateId) ?? null
    : null;

  if (!isLoaded) {
    return <SheetCenteredState loading message="Loading template…" />;
  }
  if (templateId && !existing) {
    return <SheetCenteredState message="This template was deleted." />;
  }
  return (
    <MailTemplateForm
      templateId={templateId}
      initial={existing ? mailTemplateToDraft(existing) : EMPTY_MAIL_TEMPLATE_DRAFT}
    />
  );
}

function MailTemplateForm({
  templateId,
  initial,
}: {
  templateId: string | null;
  initial: MailTemplateDraft;
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { settings, updateSettings } = useMailComposeSettings();
  const back = useSettingsBack();
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const templates = settings.templates;
  const errors = submitted ? validateMailTemplateDraft(draft, templates, templateId) : {};
  const patch = (next: Partial<MailTemplateDraft>) =>
    setDraft((current) => ({ ...current, ...next }));

  const save = () => {
    setSubmitted(true);
    if (Object.keys(validateMailTemplateDraft(draft, templates, templateId)).length > 0) return;
    updateSettings({ templates: saveMailTemplate(templates, draft, templateId).templates });
    back();
  };

  const confirmDelete = () => {
    if (!templateId) return;
    Alert.alert("Delete template", `Delete “${initial.name}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          updateSettings({ templates: deleteMailTemplate(templates, templateId) });
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
            placeholder="Thanks for reaching out"
            maxLength={MAIL_TEMPLATE_LIMITS.name}
            accessibilityLabel="Template name"
          />
        </SheetGroup>
        {errors.name ? <SheetMessage tone="destructive" text={errors.name} /> : null}
      </SheetSection>

      <SheetSection title="Subject" footer="Optional. Fills the subject only when it's empty.">
        <SheetGroup>
          <SheetTextField
            value={draft.subject}
            onChangeText={(subject) => patch({ subject })}
            placeholder="Subject"
            maxLength={MAIL_TEMPLATE_LIMITS.subject}
            accessibilityLabel="Template subject"
          />
        </SheetGroup>
        {errors.subject ? <SheetMessage tone="destructive" text={errors.subject} /> : null}
      </SheetSection>

      <SheetSection title="Text">
        <SheetGroup>
          <SheetTextField
            value={draft.body}
            onChangeText={(body) => patch({ body })}
            placeholder="The text this template inserts"
            multiline
            maxLength={MAIL_TEMPLATE_LIMITS.body}
            style={styles.body}
            accessibilityLabel="Template text"
          />
        </SheetGroup>
        {errors.body ? <SheetMessage tone="destructive" text={errors.body} /> : null}
      </SheetSection>

      {errors.form ? <SheetMessage tone="destructive" text={errors.form} /> : null}
      <SheetButton label="Save template" onPress={save} />
      {templateId ? (
        <SheetButton label="Delete template" variant="destructive" onPress={confirmDelete} />
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
