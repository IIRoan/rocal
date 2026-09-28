import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { AppScreen } from "@workspace/native-core/components/layout";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { CenteredLoader } from "@workspace/native-core/components/ui/loading";
import { MailThreadListRow } from "../../src/components/mail/MailThreadListRow";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import { MailBulkMoveSheet } from "../../src/components/mail/MailBulkMoveSheet";
import { MailBulkMoreSheet } from "../../src/components/mail/MailBulkMoreSheet";
import { MailBulkLabelsSheet } from "../../src/components/mail/MailBulkLabelsSheet";
import { MailSheetPanel } from "../../src/components/mail/MailSheetPanel";
import { MailboxDrawerSheet } from "../../src/components/mail/MailboxDrawerSheet";
import { MailFilterSheet } from "../../src/components/mail/MailFilterSheet";
import { MailAccountSheet } from "../../src/components/MailAccountSheet";
import { MailListHeader } from "../../src/components/mail/MailListHeader";
import { MailListBottomChrome } from "../../src/components/mail/MailListBottomChrome";
import { MailListAnimatedFooter } from "../../src/components/mail/MailListAnimatedFooter";
import { MailSelectionAnimProvider } from "../../src/components/mail/mail-selection-anim";
import {
  MAIL_ICON,
  mailListSeparatorInset,
} from "@workspace/native-core/components/mail/mail-ui";
import { MAILBOX_END_REACHED_THRESHOLD } from "../../src/lib/mail/mail-pagination";
import { getThreadRowState } from "../../src/lib/mail/thread-row-state";
import {
  isWebMailAvailable,
  openWebMail,
} from "../../src/lib/mail/mail-web-bridge";
import {
  useMailListController,
  type MailListController,
} from "../../src/hooks/use-mail-list-controller";

export default function MailScreen() {
  const controller = useMailListController();

  return (
    <MailSelectionAnimProvider active={controller.selectionActive}>
      <AppScreen
        header={
          <MailListHeader
            selectedCount={controller.selectedCount}
            totalCount={controller.selectableCount}
            toolbar={{
              mailboxName: controller.mailboxName,
              unreadCount: controller.unreadThreadCount,
              filterActive: controller.listFilterActive,
              onSearch: controller.openCommandPalette,
              onCompose: () => controller.openCompose(),
              onOpenMailboxes: () => controller.setDrawerOpen(true),
              onOpenFilter: () => controller.setFilterOpen(true),
              onOpenAccount: () => controller.setAccountOpen(true),
            }}
            onClearSelection={controller.clearSelection}
            onSelectAll={controller.handleSelectAll}
          />
        }
      >
        <MailScreenBody controller={controller} />
        {controller.showMailChrome ? (
          <MailListBottomChrome
            bottomInset={controller.insetsBottom}
            bulk={{
              isInTrash: controller.isInTrash,
              canMarkRead: controller.unreadSelectedIds.length > 0,
              canMarkUnread: controller.readSelectedIds.length > 0,
              busy: controller.isActionBusy,
              onMarkRead: controller.handleBulkMarkRead,
              onMarkUnread: controller.handleBulkMarkUnread,
              onTrash: controller.handleBulkTrash,
              onMore: () => controller.setActiveSheetView("bulkMore"),
            }}
          />
        ) : null}
        <MailBulkActionSheet controller={controller} />
      </AppScreen>

      <MailboxDrawerSheet
        visible={controller.drawerOpen}
        onDismiss={() => controller.setDrawerOpen(false)}
        loading={controller.drawerLoading}
        mailboxes={controller.drawerMailboxes}
        selectedMailboxId={controller.resolvedMailboxId}
        onSelectMailbox={controller.handleSelectMailbox}
        onEmptyMailbox={controller.handleEmptyMailbox}
        emptyingMailboxId={controller.emptyingMailboxId}
      />

      <MailFilterSheet
        key={controller.resolvedMailboxId ?? "mailbox"}
        visible={controller.filterOpen}
        filters={controller.listFilters}
        onFiltersChange={controller.handleListFiltersChange}
        searchFields={controller.fieldSearchFields}
        onSearchFieldsChange={controller.handleSearchFieldsChange}
        labels={controller.labels}
        resultCount={controller.threadRows.length}
        onDismiss={() => controller.setFilterOpen(false)}
      />

      <MailAccountSheet
        visible={controller.accountOpen}
        onDismiss={() => controller.setAccountOpen(false)}
      />
    </MailSelectionAnimProvider>
  );
}

function MailScreenBody({ controller }: { controller: MailListController }) {
  const { theme } = useTheme();

  if (controller.accountPending) {
    return <CenteredLoader theme={theme} />;
  }
  if (controller.accountFailed) {
    return (
      <ErrorState
        theme={theme}
        message={controller.accountErrorMessage}
        onRetry={controller.retryAccount}
      />
    );
  }
  if (!controller.provisioned) {
    return (
      <SetupState
        theme={theme}
        canCreateMailbox={controller.setupEnabled}
        isSettingUp={controller.setupPending}
        errorMessage={controller.setupErrorMessage}
        onSetup={controller.startSetup}
      />
    );
  }
  if (controller.runtimePending) {
    return (
      <CenteredLoader theme={theme} message="Connecting to your mailbox…" />
    );
  }
  if (controller.runtimeFailed) {
    return (
      <ErrorState
        theme={theme}
        message={controller.runtimeErrorMessage}
        onRetry={controller.retryRuntime}
      />
    );
  }
  return <MailThreadList controller={controller} />;
}

function MailThreadList({ controller }: { controller: MailListController }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    rowHandlers,
    showRecipient,
    labels,
    identities,
    primaryMessageIds,
    selectedIds,
    selectionActive,
    decryptedPreviews,
    timeFormat,
    timezone,
    listSettings,
    threadRows,
    listExtraData,
    resolvedMailboxId,
    pullRefreshing,
    handlePullRefresh,
    onEndReached,
    viewabilityConfigCallbackPairs,
    showMailChrome,
    idleListPadding,
    bulkListPadding,
    fetchingNextPage,
  } = controller;

  const renderItem = useCallback(
    ({ item }: { item: (typeof threadRows)[number] }) => {
      const rowState = getThreadRowState(item, primaryMessageIds, selectedIds);

      return (
        <MailThreadListRow
          row={item}
          selectableIds={rowState.selectableIds}
          unreadCount={rowState.unreadCount}
          hasAttachments={rowState.hasAttachments}
          selected={rowState.selected}
          selectionActive={selectionActive}
          preview={decryptedPreviews[item.latestMessage.id]}
          showRecipient={showRecipient}
          labels={labels}
          identities={identities}
          timeFormat={timeFormat}
          timezone={timezone}
          density={listSettings.density}
          showLabelChips={listSettings.showLabelChipsInList}
          threadExpandable={listSettings.threadExpandInList}
          handlers={rowHandlers}
        />
      );
    },
    [
      rowHandlers,
      showRecipient,
      labels,
      identities,
      primaryMessageIds,
      selectedIds,
      selectionActive,
      decryptedPreviews,
      timeFormat,
      timezone,
      listSettings.density,
      listSettings.showLabelChipsInList,
      listSettings.threadExpandInList,
    ],
  );

  const renderSeparator = useCallback(
    () => <View style={styles.separator} />,
    [styles.separator],
  );

  const listFooter = useMemo(
    () => (
      <>
        {fetchingNextPage ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primaryBase} />
          </View>
        ) : null}
        {showMailChrome ? (
          <MailListAnimatedFooter
            idlePadding={idleListPadding}
            bulkPadding={bulkListPadding}
          />
        ) : null}
      </>
    ),
    [
      showMailChrome,
      idleListPadding,
      bulkListPadding,
      fetchingNextPage,
      styles.centered,
      theme.colors.primaryBase,
    ],
  );

  return (
    <View style={styles.listArea}>
      <FlatList
        key={resolvedMailboxId ?? "mailbox"}
        style={styles.listFlex}
        data={threadRows}
        keyExtractor={(item) => item.id}
        extraData={listExtraData}
        renderItem={renderItem}
        ItemSeparatorComponent={renderSeparator}
        refreshing={pullRefreshing}
        onRefresh={handlePullRefresh}
        onEndReached={onEndReached}
        onEndReachedThreshold={MAILBOX_END_REACHED_THRESHOLD}
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
        initialNumToRender={15}
        contentContainerStyle={
          threadRows.length === 0 ? styles.emptyListContent : undefined
        }
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <MailListEmptyState
            controller={controller}
            theme={theme}
            styles={styles}
          />
        }
      />
    </View>
  );
}

function MailListEmptyState({
  controller,
  theme,
  styles,
}: {
  controller: MailListController;
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
}) {
  if (controller.listPending || controller.searchPending) {
    return <CenteredLoader theme={theme} />;
  }
  return (
    <View style={styles.centered}>
      <Feather
        name="inbox"
        size={MAIL_ICON.emptyState}
        color={theme.colors.mutedForeground}
      />
      <Text style={styles.mutedText}>
        {controller.searchErrorMessage ??
          (controller.listFilterActive
            ? "No messages match this filter"
            : "No messages here")}
      </Text>
    </View>
  );
}

function MailBulkActionSheet({
  controller,
}: {
  controller: MailListController;
}) {
  return (
    <BottomSheet
      visible={controller.activeSheetView !== null}
      onDismiss={() => controller.setActiveSheetView(null)}
      snapPoints={controller.bulkSheetSnapPoints}
    >
      <BottomSheetHeader>
        <BottomSheetTitle>
          {controller.activeSheetView === "bulkMove"
            ? "Move to"
            : controller.activeSheetView === "bulkLabel"
              ? "Labels"
              : "Actions"}
        </BottomSheetTitle>
      </BottomSheetHeader>
      {controller.activeSheetView === "bulkMore" ? (
        <MailSheetPanel bottomInset={controller.insetsBottom}>
          <MailBulkMoreSheet
            showStar={controller.unflaggedSelectedIds.length > 0}
            showUnstar={controller.flaggedSelectedIds.length > 0}
            showMove={controller.bulkMoveTargets.length > 0}
            showDeleteForever={controller.isInTrash || controller.isInSpam}
            onDeleteForever={controller.handleBulkDeleteForever}
            onStar={() => void controller.handleBulkStar()}
            onUnstar={() => void controller.handleBulkUnstar()}
            onLabels={() => controller.setActiveSheetView("bulkLabel")}
            onMove={() => controller.setActiveSheetView("bulkMove")}
          />
        </MailSheetPanel>
      ) : controller.activeSheetView === "bulkMove" ? (
        <MailBulkMoveSheet
          mailboxes={controller.bulkMoveTargets}
          bottomInset={controller.sheetPadCompact}
          disabled={controller.isActionBusy || controller.bulkIds.length === 0}
          onSelectMailbox={controller.handleBulkMove}
        />
      ) : controller.activeSheetView === "bulkLabel" ? (
        <MailSheetPanel bottomInset={controller.insetsBottom}>
          <MailBulkLabelsSheet
            labels={controller.labels}
            onBack={() => controller.setActiveSheetView("bulkMore")}
            onApplyLabel={(labelId) =>
              void controller.handleBulkApplyLabel(labelId)
            }
          />
        </MailSheetPanel>
      ) : null}
    </BottomSheet>
  );
}

function ErrorState({
  theme,
  message,
  onRetry,
}: {
  theme: ThemeTokens;
  message: string;
  onRetry: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.centered}>
      <Feather
        name="alert-triangle"
        size={MAIL_ICON.emptyState}
        color={theme.colors.destructive}
      />
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Try again</Text>
      </Pressable>
      {isWebMailAvailable() ? (
        <Pressable onPress={() => openWebMail()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Open secure web mail</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SetupState({
  theme,
  canCreateMailbox,
  isSettingUp,
  errorMessage,
  onSetup,
}: {
  theme: ThemeTokens;
  canCreateMailbox: boolean;
  isSettingUp: boolean;
  errorMessage: string | null;
  onSetup: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.centered}>
      <Feather
        name="mail"
        size={MAIL_ICON.emptyState}
        color={theme.colors.primaryBase}
      />
      <Text style={styles.setupTitle}>Set up your mailbox</Text>
      <Text style={styles.mutedText}>
        Create your encrypted mailbox on this device. Solace generates a random
        OpenPGP keypair locally, uploads only the public key, and stores your
        private key in an encrypted vault backup.
      </Text>
      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}
      {canCreateMailbox ? (
        <Pressable
          onPress={onSetup}
          disabled={isSettingUp}
          style={[
            styles.primaryButton,
            isSettingUp && styles.primaryButtonDisabled,
          ]}
        >
          {isSettingUp ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.primaryForeground}
            />
          ) : null}
          <Text style={styles.primaryButtonText}>
            {isSettingUp ? "Creating mailbox…" : "Create mailbox here"}
          </Text>
        </Pressable>
      ) : isWebMailAvailable() ? (
        <Pressable onPress={() => openWebMail()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Open secure web mail</Text>
        </Pressable>
      ) : (
        <Text style={styles.mutedText}>
          Mailbox setup is disabled for this environment.
        </Text>
      )}
      {canCreateMailbox && isWebMailAvailable() ? (
        <Pressable onPress={() => openWebMail()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Open secure web mail</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const separatorInset = mailListSeparatorInset(theme);

  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      position: "relative",
    },
    listArea: {
      flex: 1,
    },
    listFlex: {
      flex: 1,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginLeft: separatorInset,
    },
    centered: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["6"],
    },
    emptyListContent: {
      flexGrow: 1,
    },
    primaryButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    secondaryButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    mutedText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    errorText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    setupTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
