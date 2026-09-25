import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Height of the software keyboard on iOS; 0 when hidden or on Android (window resize). */
export function useKeyboardInset(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios") {
      return;
    }

    const shown = Keyboard.addListener("keyboardWillShow", (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener("keyboardWillHide", () => {
      setHeight(0);
    });

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
}
