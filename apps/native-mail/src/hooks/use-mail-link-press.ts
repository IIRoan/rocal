import { Alert, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  assessMailLink,
  describeMailLink,
  parseMailtoLink,
  shouldConfirmMailLink,
} from "@workspace/calendar-core";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useMailCompose } from "../providers/MailComposeProvider";
import { useMailDisplaySettings } from "./use-mail-settings";

const SHOWN_URL_MAX_LENGTH = 300;

/** Links tapped in a message: mailto opens compose, tel the dialer, http(s) the browser after the link check; anything else stays blocked. */
export function useMailLinkPress() {
  const { openCompose } = useMailCompose();
  const { toast } = useToast();
  const { settings } = useMailDisplaySettings();

  const openInBrowser = (href: string) => {
    WebBrowser.openBrowserAsync(href).catch(() => toast("Couldn't open the link.", "error"));
  };

  return (link: { href: string; text: string }) => {
    if (/^mailto:/i.test(link.href)) {
      const mailto = parseMailtoLink(link.href);
      if (mailto) openCompose({ mailto });
      else toast("This email link can't be opened.", "error");
      return;
    }
    if (/^tel:/i.test(link.href)) {
      Linking.openURL(link.href).catch(() => toast("Couldn't open the phone app.", "error"));
      return;
    }
    if (!/^https?:/i.test(link.href)) return;
    // The WebView hands over its canonical URL, so the host here is the one the browser opens.
    const assessment = assessMailLink(link.href, link.text);
    if (!shouldConfirmMailLink(assessment, settings.confirmExternalLinks)) {
      openInBrowser(link.href);
      return;
    }
    const { title, lines } = describeMailLink(assessment);
    const shownUrl =
      link.href.length > SHOWN_URL_MAX_LENGTH ? `${link.href.slice(0, SHOWN_URL_MAX_LENGTH)}…` : link.href;
    Alert.alert(title, [...lines, shownUrl].join("\n\n"), [
      { text: "Cancel", style: "cancel" },
      { text: "Open", onPress: () => openInBrowser(link.href) },
    ]);
  };
}
