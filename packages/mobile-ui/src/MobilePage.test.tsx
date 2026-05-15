import React from "react";
import { render } from "@testing-library/react-native";
import MobilePage from "./MobilePage";

describe("MobilePage", () => {
  it("renders correctly", () => {
    const { getByText } = render(<MobilePage>Hello</MobilePage>);
    expect(getByText("Hello")).toBeTruthy();
  });
});
