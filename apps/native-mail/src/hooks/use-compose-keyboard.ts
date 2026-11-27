import { useEffect, useState } from "react";
import { Keyboard, Platform, type KeyboardEvent } from "react-native";
import { Easing, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

/** Close to UIKit's keyboard curve, so what rides on the keyboard moves with it. */
const KEYBOARD_EASING = Easing.bezier(0.17, 0.59, 0.4, 0.77);

export type ComposeKeyboard = {
  open: boolean;
  /** The keyboard's height as it animates (iOS; Android resizes the window instead). */
  height: SharedValue<number>;
  /** The height once the keyboard has settled, for layout that must not change every frame. */
  settledInset: number;
};

export function useComposeKeyboard(): ComposeKeyboard {
  const [open, setOpen] = useState(false);
  const [settledInset, setSettledInset] = useState(0);
  const height = useSharedValue(0);

  useEffect(() => {
    const ios = Platform.OS === "ios";
    const animate = (to: number, event: KeyboardEvent) => {
      height.set(withTiming(to, { duration: event.duration || 250, easing: KEYBOARD_EASING }));
    };
    const subscriptions = [
      Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (event) => {
        setOpen(true);
        if (ios) animate(event.endCoordinates.height, event);
      }),
      // The body shrinks only once the keyboard covers the area it gives up, so nothing visibly jumps.
      ...(ios ? [Keyboard.addListener("keyboardDidShow", (event) => setSettledInset(event.endCoordinates.height))] : []),
      Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", (event) => {
        setOpen(false);
        setSettledInset(0);
        if (ios) animate(0, event);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [height]);

  return { open, height, settledInset };
}
