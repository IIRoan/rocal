import { sanitizeContext } from "@workspace/calendar-core/report-redaction";
import type { WorkspaceLogger } from "@workspace/logger";
import {
  assertMailEncryptionUpdate,
  assertSuccessfulJmapResponses,
  assertVacationResponseSet,
  buildEmailDestroyMethodCall,
  buildEmailMarkReadMethodCall,
  buildEmailMoveMethodCall,
  buildUnreadMailboxQueryMethodCall,
  buildVacationResponseGetCall,
  buildVacationResponseSetCall,
  cancelHeldJmapSubmission,
  DEFAULT_JMAP_MAX_METHOD_CALLS,
  disabledAppendEncryption,
  drainMailboxInBatches,
  getPrimaryMailAccountId,
  getSubmissionAccountId,
  listScheduledJmapSends,
  moveCanceledJmapCopyToDrafts,
  openMailboxNames,
  parseVacationResponseGet,
  resolveMailboxSearchPageSize,
  resolveMailServerPolicy,
  saveJmapDraft,
  sealPlaintextMailboxNames,
  sortMailMessagesBySearchRelevance,
  STALWART_EMAIL_POLICY_PROPERTIES,
  STALWART_JMAP_POLICY_PROPERTIES,
  vacationResponseAccountId,
  VACATION_RESPONSE_USING,
  withDraftsSeen,
  type HeldSubmissionCancelResult,
  type JmapDraft,
  type JmapEmailChanges,
  type JmapEmailMessage,
  type JmapEmailSetMethodCall,
  type JmapIdentity,
  type JmapMailbox,
  type JmapMethodCallLike,
  type JmapSession,
  type MailboxNameCipher,
  type MailServerPolicy,
  type MailServerPolicyConfig,
  type ScheduledMailSend,
  type VacationResponse,
  type VacationResponseUpdate,
} from "@workspace/calendar-core";

export type JmapEnvelope = { methodResponses?: JmapMethodCallLike[] };

type MailboxQuery = {
  filter: Record<string, unknown>;
  limit: number;
  position: number;
  calculateTotal?: boolean;
};

const MAIL_SERVER_POLICY_REFRESH_TTL_MS = 60_000;
const MAIL_CAPABILITIES = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
];

export abstract class JmapMailClient {
  protected mailServerPolicy: MailServerPolicy | null = null;
  private mailServerPolicyConfig: Partial<MailServerPolicyConfig> | null = null;
  private mailServerPolicyFetchedAtMs = 0;
  private mailServerPolicyInflight: Promise<MailServerPolicy | null> | null =
    null;

  protected constructor(
    private readonly getMailboxNameCipher: () => Promise<MailboxNameCipher | null>,
    private readonly log: WorkspaceLogger,
  ) {}

  protected abstract call(
    session: JmapSession,
    capabilities: string[],
    methodCalls: JmapMethodCallLike[],
  ): Promise<JmapEnvelope>;

  protected abstract getDefaultMailboxPageSize(): number;

  protected requirePrimaryAccountId(session: JmapSession): string {
    const accountId = getPrimaryMailAccountId(session);

    if (!accountId) {
      throw new Error("JMAP session did not include a primary mail account.");
    }

    return accountId;
  }

  protected getMethodResult<T>(envelope: JmapEnvelope, methodName: string): T {
    const tuple = (envelope.methodResponses ?? []).find(
      (entry) => entry[0] === methodName,
    );

    if (!tuple) {
      throw new Error(`JMAP response did not include ${methodName}.`);
    }

    const result = tuple[1];
    if (methodName === "Email/get" && Array.isArray(result.list)) {
      return {
        ...result,
        list: withDraftsSeen(result.list as JmapEmailMessage[]),
      } as T;
    }
    return result as T;
  }

  setMailServerPolicy(
    policy: MailServerPolicy | null,
    configPolicy: Partial<MailServerPolicyConfig> | null = null,
  ): void {
    this.mailServerPolicy = policy;
    this.mailServerPolicyConfig = configPolicy;
    this.mailServerPolicyFetchedAtMs = policy ? Date.now() : 0;
  }

  async syncMailServerPolicy(
    session: JmapSession,
    options?: { force?: boolean },
  ): Promise<MailServerPolicy | null> {
    if (
      !options?.force &&
      this.mailServerPolicy &&
      Date.now() - this.mailServerPolicyFetchedAtMs <
        MAIL_SERVER_POLICY_REFRESH_TTL_MS
    ) {
      return this.mailServerPolicy;
    }

    if (this.mailServerPolicyInflight) {
      return this.mailServerPolicyInflight;
    }

    const inflight = this.getStalwartPolicySingletons(session)
      .then((stalwartPolicy) => {
        const nextPolicy = resolveMailServerPolicy({
          session,
          emailSettings: stalwartPolicy.emailSettings,
          jmapSettings: stalwartPolicy.jmapSettings,
          configPolicy: this.mailServerPolicyConfig,
        });
        this.setMailServerPolicy(nextPolicy, this.mailServerPolicyConfig);
        return nextPolicy;
      })
      .finally(() => {
        if (this.mailServerPolicyInflight === inflight) {
          this.mailServerPolicyInflight = null;
        }
      });

    this.mailServerPolicyInflight = inflight;
    return inflight;
  }

  protected getEmailGetChunkSize(): number {
    return this.mailServerPolicy?.getMaxResults ?? 500;
  }

  protected getDefaultSearchPageSize(): number {
    return this.mailServerPolicy
      ? resolveMailboxSearchPageSize(this.mailServerPolicy, 40)
      : 40;
  }

  protected getMaxMethodCalls(): number {
    return (
      this.mailServerPolicy?.maxMethodCalls ?? DEFAULT_JMAP_MAX_METHOD_CALLS
    );
  }

  async getAccountSettings(
    session: JmapSession,
  ): Promise<Record<string, unknown>> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      [["x:AccountSettings/get", { accountId, ids: ["singleton"] }, "c1"]],
    );
    const result = this.getMethodResult<{
      list?: Array<Record<string, unknown>>;
    }>(envelope, "x:AccountSettings/get");

    return result.list?.[0] ?? { encryptionAtRest: { "@type": "Disabled" } };
  }

  /** Stalwart's encryptOnAppend re-encrypts submissions with the user's PGP key, breaking external delivery. */
  async ensureEncryptOnAppendDisabled(session: JmapSession): Promise<void> {
    const encryptionAtRest = disabledAppendEncryption(
      await this.getAccountSettings(session),
    );
    if (!encryptionAtRest) {
      return;
    }

    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      [
        [
          "x:AccountSettings/set",
          { accountId, update: { singleton: { encryptionAtRest } } },
          "c1",
        ],
      ],
    );
    assertMailEncryptionUpdate(
      this.getMethodResult<unknown>(envelope, "x:AccountSettings/set"),
    );
  }

  async getStalwartPolicySingletons(session: JmapSession): Promise<{
    emailSettings: Record<string, unknown> | null;
    jmapSettings: Record<string, unknown> | null;
  }> {
    try {
      const envelope = await this.call(
        session,
        ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
        [
          [
            "x:Email/get",
            {
              ids: ["singleton"],
              properties: [...STALWART_EMAIL_POLICY_PROPERTIES],
            },
            "e1",
          ],
          [
            "x:Jmap/get",
            {
              ids: ["singleton"],
              properties: [...STALWART_JMAP_POLICY_PROPERTIES],
            },
            "j1",
          ],
        ],
      );
      const emailResult = this.getMethodResult<{
        list?: Array<Record<string, unknown>>;
      }>(envelope, "x:Email/get");
      const jmapResult = this.getMethodResult<{
        list?: Array<Record<string, unknown>>;
      }>(envelope, "x:Jmap/get");
      return {
        emailSettings: emailResult.list?.[0] ?? null,
        jmapSettings: jmapResult.list?.[0] ?? null,
      };
    } catch {
      return { emailSettings: null, jmapSettings: null };
    }
  }

  async getMailboxes(session: JmapSession): Promise<JmapMailbox[]> {
    const accountId = this.requirePrimaryAccountId(session);
    const properties = ["id", "name", "role", "parentId", "sortOrder"];
    const envelope = await this.call(session, MAIL_CAPABILITIES, [
      ["Mailbox/get", { accountId, properties }, "c1"],
    ]);
    const result = this.getMethodResult<{ list?: JmapMailbox[] }>(
      envelope,
      "Mailbox/get",
    );
    return this.readMailboxes(session, result.list ?? []);
  }

  protected async readMailboxes(
    session: JmapSession,
    mailboxes: JmapMailbox[],
  ): Promise<JmapMailbox[]> {
    const cipher = await this.getMailboxNameCipher();
    if (cipher) {
      const update = await sealPlaintextMailboxNames(mailboxes, cipher);
      if (Object.keys(update).length) {
        const accountId = this.requirePrimaryAccountId(session);
        await this.setMailboxes(session, { accountId, update }).catch(
          (error: unknown) => {
            this.log.warn(
              "Could not encrypt folder names",
              sanitizeContext({ error }),
            );
          },
        );
      }
    }
    return openMailboxNames(mailboxes, cipher);
  }

  private async sealMailboxName(name: string): Promise<string> {
    const cipher = await this.getMailboxNameCipher();
    if (!cipher) throw new Error("Unlock your encrypted data to name folders.");
    return cipher.seal(name);
  }

  private async setMailboxes(
    session: JmapSession,
    args: Record<string, unknown>,
  ) {
    const envelope = await this.call(session, MAIL_CAPABILITIES, [
      ["Mailbox/set", args, "c1"],
    ]);
    assertSuccessfulJmapResponses(envelope, "Mailbox/set");
    return this.getMethodResult<{ created?: Record<string, JmapMailbox> }>(
      envelope,
      "Mailbox/set",
    );
  }

  async createMailbox(
    session: JmapSession,
    name: string,
    role?: string | null,
  ): Promise<JmapMailbox> {
    const accountId = this.requirePrimaryAccountId(session);
    const mailbox = role
      ? { name, role }
      : { name: await this.sealMailboxName(name) };
    const result = await this.setMailboxes(session, {
      accountId,
      create: { new: mailbox },
    });
    const created = result.created?.new;
    if (!created) throw new Error("Mailbox was not created.");
    return { ...created, name, role: role ?? created.role ?? null };
  }

  async renameMailbox(
    session: JmapSession,
    mailboxId: string,
    name: string,
  ): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    const sealed = await this.sealMailboxName(name);
    await this.setMailboxes(session, {
      accountId,
      update: { [mailboxId]: { name: sealed } },
    });
  }

  async deleteMailbox(session: JmapSession, mailboxId: string): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.setMailboxes(session, { accountId, destroy: [mailboxId] });
  }

  async updateMailboxSortOrders(
    session: JmapSession,
    updates: { id: string; sortOrder: number }[],
  ): Promise<void> {
    if (!updates.length) return;
    const accountId = this.requirePrimaryAccountId(session);
    const update = Object.fromEntries(
      updates.map(({ id, sortOrder }) => [id, { sortOrder }]),
    );
    await this.setMailboxes(session, { accountId, update });
  }

  async getIdentities(session: JmapSession): Promise<JmapIdentity[]> {
    const accountId = this.requirePrimaryAccountId(session);
    const properties = [
      "id",
      "email",
      "name",
      "textSignature",
      "htmlSignature",
    ];
    const envelope = await this.call(
      session,
      [...MAIL_CAPABILITIES, "urn:ietf:params:jmap:submission"],
      [["Identity/get", { accountId, properties }, "c1"]],
    );
    return (
      this.getMethodResult<{ list?: JmapIdentity[] }>(envelope, "Identity/get")
        .list ?? []
    );
  }

  async getVacationResponse(
    session: JmapSession,
  ): Promise<VacationResponse | null> {
    const accountId = vacationResponseAccountId(
      session,
      this.requirePrimaryAccountId(session),
    );
    const envelope = await this.call(session, VACATION_RESPONSE_USING, [
      buildVacationResponseGetCall(accountId),
    ]);
    return parseVacationResponseGet(
      this.getMethodResult<unknown>(envelope, "VacationResponse/get"),
    );
  }

  async setVacationResponse(
    session: JmapSession,
    update: VacationResponseUpdate,
  ): Promise<void> {
    const accountId = vacationResponseAccountId(
      session,
      this.requirePrimaryAccountId(session),
    );
    const envelope = await this.call(session, VACATION_RESPONSE_USING, [
      buildVacationResponseSetCall(accountId, update),
    ]);
    assertVacationResponseSet(
      this.getMethodResult<unknown>(envelope, "VacationResponse/set"),
    );
  }

  private emailQuery(
    accountId: string,
    query: MailboxQuery,
  ): JmapMethodCallLike {
    return [
      "Email/query",
      {
        accountId,
        ...query,
        sort: [{ property: "receivedAt", isAscending: false }],
      },
      "q1",
    ];
  }

  protected async queryMessages(
    session: JmapSession,
    query: MailboxQuery,
    get: { properties: readonly string[]; includeBodies?: boolean },
    searchText?: string | null,
  ): Promise<{ messages: JmapEmailMessage[]; total: number }> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(session, MAIL_CAPABILITIES, [
      this.emailQuery(accountId, query),
      [
        "Email/get",
        {
          accountId,
          "#ids": { resultOf: "q1", name: "Email/query", path: "/ids" },
          properties: get.properties,
          ...(get.includeBodies && {
            fetchTextBodyValues: true,
            fetchHTMLBodyValues: true,
            fetchAllBodyValues: true,
          }),
        },
        "g1",
      ],
    ]);
    assertSuccessfulJmapResponses(envelope, "Load messages");
    const { total } = this.getMethodResult<{ total?: number }>(
      envelope,
      "Email/query",
    );
    const { list } = this.getMethodResult<{ list?: JmapEmailMessage[] }>(
      envelope,
      "Email/get",
    );
    const messages = list ?? [];
    return {
      messages: searchText
        ? sortMailMessagesBySearchRelevance(messages, searchText)
        : messages,
      total: total ?? 0,
    };
  }

  async getMailboxMessageIds(
    session: JmapSession,
    mailboxId: string,
    {
      limit = this.getDefaultMailboxPageSize(),
      position = 0,
    }: { limit?: number; position?: number } = {},
  ): Promise<{ ids: string[]; total: number; queryState?: string }> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(session, MAIL_CAPABILITIES, [
      this.emailQuery(accountId, {
        filter: { inMailbox: mailboxId },
        limit,
        position,
      }),
    ]);
    const result = this.getMethodResult<{
      ids?: string[];
      total?: number;
      queryState?: string;
    }>(envelope, "Email/query");
    return {
      ids: result.ids ?? [],
      total: result.total ?? 0,
      queryState: result.queryState,
    };
  }

  async getThreadMessageIds(
    session: JmapSession,
    threadId: string,
  ): Promise<string[]> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(session, MAIL_CAPABILITIES, [
      ["Thread/get", { accountId, ids: [threadId] }, "t1"],
    ]);
    const result = this.getMethodResult<{ list?: { emailIds?: string[] }[] }>(
      envelope,
      "Thread/get",
    );
    return result.list?.[0]?.emailIds ?? [];
  }

  async getEmailChanges(
    session: JmapSession,
    sinceState: string,
    options: { maxChanges?: number } = {},
  ): Promise<JmapEmailChanges> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(session, MAIL_CAPABILITIES, [
      [
        "Email/changes",
        { accountId, sinceState, maxChanges: options.maxChanges ?? 500 },
        "c1",
      ],
    ]);
    const result = this.getMethodResult<Partial<JmapEmailChanges>>(
      envelope,
      "Email/changes",
    );

    return {
      oldState: result.oldState ?? sinceState,
      newState: result.newState ?? sinceState,
      hasMoreChanges: result.hasMoreChanges,
      created: result.created ?? [],
      updated: result.updated ?? [],
      destroyed: result.destroyed ?? [],
    };
  }

  async cancelHeldSubmission(
    session: JmapSession,
    input: {
      submissionId: string;
      copyEmailId: string;
      draftsMailboxId: string;
    },
  ): Promise<HeldSubmissionCancelResult> {
    const mailAccountId = this.requirePrimaryAccountId(session);
    return cancelHeldJmapSubmission({
      ...input,
      mailAccountId,
      submissionAccountId: getSubmissionAccountId(session, mailAccountId),
      request: (using, calls) => this.call(session, using, calls),
      onMoveError: (error) => {
        this.log.warn(
          "Canceled send move to Drafts failed",
          sanitizeContext({ error }),
        );
      },
    });
  }

  async moveCanceledSendToDrafts(
    session: JmapSession,
    input: { copyEmailId: string; draftsMailboxId: string },
  ): Promise<void> {
    return moveCanceledJmapCopyToDrafts({
      ...input,
      mailAccountId: this.requirePrimaryAccountId(session),
      request: (using, calls) => this.call(session, using, calls),
    });
  }

  async listScheduledSends(session: JmapSession): Promise<ScheduledMailSend[]> {
    const mailAccountId = this.requirePrimaryAccountId(session);
    return listScheduledJmapSends({
      mailAccountId,
      submissionAccountId: getSubmissionAccountId(session, mailAccountId),
      request: (using, calls) => this.call(session, using, calls),
    });
  }

  async saveDraft(session: JmapSession, input: JmapDraft): Promise<string> {
    await this.syncMailServerPolicy(session);

    return saveJmapDraft(input, {
      accountId: this.requirePrimaryAccountId(session),
      policy: this.mailServerPolicy,
      request: (using, calls) => this.call(session, using, calls),
    });
  }

  protected async applyEmailSet(
    session: JmapSession,
    method: JmapEmailSetMethodCall,
    context: string,
  ): Promise<void> {
    const envelope = await this.call(session, MAIL_CAPABILITIES, [method]);
    assertSuccessfulJmapResponses(envelope, context);
  }

  moveToTrash(
    session: JmapSession,
    messageId: string,
    trashMailboxId: string | null,
  ): Promise<void> {
    return this.bulkMoveToTrash(session, [messageId], trashMailboxId);
  }

  bulkMoveToTrash(
    session: JmapSession,
    messageIds: string[],
    trashMailboxId: string | null,
  ): Promise<void> {
    return trashMailboxId
      ? this.bulkMoveToMailbox(session, messageIds, trashMailboxId)
      : this.bulkDestroyMessages(session, messageIds);
  }

  moveToMailbox(
    session: JmapSession,
    messageId: string,
    targetMailboxId: string,
  ): Promise<void> {
    return this.bulkMoveToMailbox(session, [messageId], targetMailboxId);
  }

  async bulkMoveToMailbox(
    session: JmapSession,
    messageIds: string[],
    targetMailboxId: string,
  ): Promise<void> {
    if (!messageIds.length) return;
    const method = buildEmailMoveMethodCall(
      this.requirePrimaryAccountId(session),
      messageIds,
      targetMailboxId,
    );
    await this.applyEmailSet(session, method, "Move messages");
  }

  async bulkDestroyMessages(
    session: JmapSession,
    messageIds: string[],
  ): Promise<void> {
    if (!messageIds.length) return;
    const method = buildEmailDestroyMethodCall(
      this.requirePrimaryAccountId(session),
      messageIds,
    );
    await this.applyEmailSet(session, method, "Delete messages");
  }

  async emptyMailbox(session: JmapSession, mailboxId: string): Promise<number> {
    return drainMailboxInBatches({
      listIds: async (limit) =>
        (
          await this.getMailboxMessageIds(session, mailboxId, {
            limit,
            position: 0,
          })
        ).ids,
      apply: (ids) => this.bulkDestroyMessages(session, ids),
    });
  }

  async markMailboxAsRead(
    session: JmapSession,
    mailboxId: string,
  ): Promise<number> {
    const accountId = this.requirePrimaryAccountId(session);
    return drainMailboxInBatches({
      listIds: async (limit) => {
        const envelope = await this.call(session, MAIL_CAPABILITIES, [
          buildUnreadMailboxQueryMethodCall(accountId, mailboxId, limit),
        ]);
        return (
          this.getMethodResult<{ ids?: string[] }>(envelope, "Email/query")
            .ids ?? []
        );
      },
      apply: (ids) => this.bulkMarkAsRead(session, ids),
    });
  }

  markAsRead(session: JmapSession, messageId: string): Promise<void> {
    return this.bulkMarkAsRead(session, [messageId]);
  }

  markAsUnread(session: JmapSession, messageId: string): Promise<void> {
    return this.bulkMarkAsUnread(session, [messageId]);
  }

  async bulkMarkAsRead(
    session: JmapSession,
    messageIds: string[],
  ): Promise<void> {
    if (!messageIds.length) return;
    const method = buildEmailMarkReadMethodCall(
      this.requirePrimaryAccountId(session),
      messageIds,
    );
    await this.applyEmailSet(session, method, "Mark as read");
  }

  bulkMarkAsUnread(session: JmapSession, messageIds: string[]): Promise<void> {
    return this.setKeywords(session, messageIds, "$seen", false);
  }

  toggleFlagged(
    session: JmapSession,
    messageId: string,
    flagged: boolean,
  ): Promise<void> {
    return this.setMessageKeyword(session, messageId, "$flagged", flagged);
  }

  setMessageLabel(
    session: JmapSession,
    messageId: string,
    labelId: string,
    assigned: boolean,
  ): Promise<void> {
    return this.setMessageKeyword(
      session,
      messageId,
      `label:${labelId}`,
      assigned,
    );
  }

  setMessageKeyword(
    session: JmapSession,
    messageId: string,
    keyword: string,
    enabled: boolean,
  ): Promise<void> {
    return this.setKeywords(session, [messageId], keyword, enabled);
  }

  private async setKeywords(
    session: JmapSession,
    messageIds: string[],
    keyword: string,
    enabled: boolean,
  ): Promise<void> {
    if (!messageIds.length) return;
    const accountId = this.requirePrimaryAccountId(session);
    const patch = { [`keywords/${keyword}`]: enabled ? true : null };
    const update = Object.fromEntries(messageIds.map((id) => [id, patch]));
    await this.applyEmailSet(
      session,
      ["Email/set", { accountId, update }, "c1"],
      "Update message keywords",
    );
  }
}
