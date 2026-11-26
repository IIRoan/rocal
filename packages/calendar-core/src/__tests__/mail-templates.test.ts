import { describe, expect, it } from "@jest/globals";
import {
  MAIL_TEMPLATE_LIMITS,
  deleteMailTemplate,
  insertMailTemplateText,
  normalizeMailTemplates,
  resolveMailTemplateSubject,
  saveMailTemplate,
  validateMailTemplateDraft,
  type MailTemplate,
} from "../mail-templates";
import { normalizeMailComposeSettings } from "../mail-compose-settings";
import { sanitizeMailSyncedSettings } from "../mail-synced-settings";

const thanks: MailTemplate = { id: "t1", name: "Thanks", body: "Thanks, got it." };

describe("normalizeMailTemplates", () => {
  it("keeps valid templates and drops malformed, unknown-key and duplicate entries", () => {
    expect(
      normalizeMailTemplates([
        thanks,
        { ...thanks, name: "Again" },
        { id: "t2", name: "  ", body: "x" },
        { id: "t3", name: "Extra", body: "x", html: "<b>x</b>" },
        { id: "t4", name: "Long", body: "x".repeat(MAIL_TEMPLATE_LIMITS.body + 1) },
        "not a template",
        { id: "t5", name: "Intro", subject: "Hello", body: "Hi there" },
      ]),
    ).toEqual([thanks, { id: "t5", name: "Intro", subject: "Hello", body: "Hi there" }]);
    expect(normalizeMailTemplates("nope")).toEqual([]);
  });

  it("caps the list at the template limit", () => {
    const many = Array.from({ length: MAIL_TEMPLATE_LIMITS.count + 5 }, (_, index) => ({
      id: `t${index}`,
      name: `Template ${index}`,
      body: "x",
    }));
    expect(normalizeMailTemplates(many)).toHaveLength(MAIL_TEMPLATE_LIMITS.count);
  });

  it("survives the synced settings round trip inside the compose group", () => {
    const synced = sanitizeMailSyncedSettings({ compose: { templates: [thanks, { id: 1 }] } });
    expect(synced.compose.templates).toEqual([thanks]);
    expect(normalizeMailComposeSettings({}).templates).toEqual([]);
  });
});

describe("validateMailTemplateDraft", () => {
  it("asks for a name and a body", () => {
    expect(validateMailTemplateDraft({ name: " ", subject: "", body: "" }, [], null)).toEqual({
      name: "Give the template a name.",
      body: "Write the text this template inserts.",
    });
  });

  it("rejects a duplicate name except on the template being edited", () => {
    const draft = { name: "thanks", subject: "", body: "Hi" };
    expect(validateMailTemplateDraft(draft, [thanks], null).name).toBe(
      "You already have a template with this name.",
    );
    expect(validateMailTemplateDraft(draft, [thanks], "t1")).toEqual({});
  });

  it("enforces the field, count and total size limits", () => {
    expect(
      validateMailTemplateDraft(
        { name: "n".repeat(81), subject: "s".repeat(201), body: "b".repeat(20_001) },
        [],
        null,
      ),
    ).toEqual({
      name: "Use 80 characters or fewer.",
      subject: "Use 200 characters or fewer.",
      body: "Use 20,000 characters or fewer.",
    });
    const full = Array.from({ length: MAIL_TEMPLATE_LIMITS.count }, (_, index) => ({
      id: `t${index}`,
      name: `Template ${index}`,
      body: "x",
    }));
    expect(validateMailTemplateDraft({ name: "New", subject: "", body: "x" }, full, null).form).toMatch(
      /up to 50 templates/,
    );
    const large = [{ id: "big", name: "Big", body: "é".repeat(15_000) }];
    expect(
      validateMailTemplateDraft({ name: "Another", subject: "", body: "x".repeat(1_000) }, large, null)
        .form,
    ).toMatch(/templates are full/);
  });
});

describe("saveMailTemplate and deleteMailTemplate", () => {
  it("adds with a fresh id, edits in place and deletes by id", () => {
    const added = saveMailTemplate([thanks], { name: " Intro ", subject: " ", body: "Hi" }, null);
    expect(added.id).toMatch(/^[0-9a-f]{32}$/);
    expect(added.templates[1]).toEqual({ id: added.id, name: "Intro", body: "Hi" });
    const edited = saveMailTemplate(added.templates, { name: "Thanks", subject: "Re", body: "Ok" }, "t1");
    expect(edited.templates[0]).toEqual({ id: "t1", name: "Thanks", subject: "Re", body: "Ok" });
    expect(deleteMailTemplate(edited.templates, "t1").map((template) => template.id)).toEqual([added.id]);
  });
});

describe("inserting a template", () => {
  it("replaces the selection, or inserts at the start without one", () => {
    expect(insertMailTemplateText("Hello world", { start: 6, end: 11 }, "there")).toEqual({
      text: "Hello there",
      selection: { start: 11, end: 11 },
    });
    expect(insertMailTemplateText("Quoted", null, "Hi\n")).toEqual({
      text: "Hi\nQuoted",
      selection: { start: 3, end: 3 },
    });
    expect(insertMailTemplateText("ab", { start: 9, end: 2 }, "c").text).toBe("abc");
  });

  it("fills the subject only when it is empty", () => {
    const withSubject = { ...thanks, subject: " Your order " };
    expect(resolveMailTemplateSubject("", withSubject)).toBe("Your order");
    expect(resolveMailTemplateSubject("Re: hi", withSubject)).toBe("Re: hi");
    expect(resolveMailTemplateSubject("", thanks)).toBe("");
  });
});
