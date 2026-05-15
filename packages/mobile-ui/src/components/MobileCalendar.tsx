import React from "react";
import {
  MobileEventCalendar,
  MobileEventCalendarProps,
} from "@solace/ui/dist/components/calendar/mobile-event-calendar";
import {
  Gesture,
  GestureDetector,
  Directions,
} from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { View } from "react-native";

export function MobileCalendar(props: MobileEventCalendarProps) {
  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      runOnJS(props.onNext)();
    });

  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      runOnJS(props.onPrevious)();
    });

  return (
    <GestureDetector gesture={Gesture.Simultaneous(flingLeft, flingRight)}>
      <View testID="mobile-calendar">
        <MobileEventCalendar {...props} />
      </View>
    </GestureDetector>
  );
}
