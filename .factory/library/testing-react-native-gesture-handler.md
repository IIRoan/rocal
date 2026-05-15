# Testing React Native components with `react-native-gesture-handler`

When testing components that use `react-native-gesture-handler`, you may encounter issues with the test environment.

**Problem:**

Tests may fail with a `SyntaxError` due to Jest not being able to parse the syntax used by the library.

**Solution:**

Ensure that your Jest and Babel configurations are set up correctly to transform the `react-native-gesture-handler` modules. This may involve:

1.  **Updating `jest.config.js`:**
    - Ensure that `transformIgnorePatterns` is correctly configured to include `react-native-gesture-handler` for transformation.
2.  **Updating `babel.config.js`:**
    - Ensure that you have the necessary Babel presets and plugins to handle the syntax used by the library.

**Example:**

For a detailed example of a working configuration, refer to the project's `jest.config.js` and `babel.config.js` files after the fix for the "Calendar Swipe Controls" milestone has been implemented.
