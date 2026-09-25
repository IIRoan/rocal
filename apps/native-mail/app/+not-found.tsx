import { NotFoundScreen } from "@workspace/native-core/screens/NotFoundScreen";
import { MAIL_HOME_ROUTE } from "../src/lib/mail-routes";

export default function MailNotFoundScreen() {
  return <NotFoundScreen homeRoute={MAIL_HOME_ROUTE} homeLabel="Mail" />;
}
