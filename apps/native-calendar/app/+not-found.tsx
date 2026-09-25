import { NotFoundScreen } from "@workspace/native-core/screens/NotFoundScreen";
import { CALENDAR_HOME_ROUTE } from "../src/lib/calendar-routes";

export default function CalendarNotFoundScreen() {
  return <NotFoundScreen homeRoute={CALENDAR_HOME_ROUTE} homeLabel="Calendar" />;
}
