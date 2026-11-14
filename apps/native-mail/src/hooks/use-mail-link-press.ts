import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { parseMailtoLink } from "@workspace/calendar-core";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useMailCompose } from "../providers/MailComposeProvider";

/** Links tapped in a message: mailto opens compose, tel the dialer, http(s) the browser; anything else stays blocked. */
export function useMailLinkPress() {
  const { openCompose } = useMailCompose();
  const { toast } = useToast();

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
    if (/^https?:/i.test(link.href)) {
      WebBrowser.openBrowserAsync(link.href).catch(() => toast("Couldn't open the link.", "error"));
    }
  };
}
