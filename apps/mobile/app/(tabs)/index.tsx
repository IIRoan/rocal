import { SafeAreaView } from 'react-native-safe-area-context';
import { MobileCalendarWrapper } from '@workspace/ui/components/calendar';

export default function CalendarScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
      <MobileCalendarWrapper initialView="day" weekStartDay={1} />
    </SafeAreaView>
  );
}
