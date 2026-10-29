import { Component, type ReactNode } from "react";
import { AppErrorSheet } from "./AppErrorSheet";

interface AppErrorBoundaryState {
  failed: boolean;
}

/** Only a class component can catch render errors; without one, any render bug closes the whole app. */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  retry = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? (
      <AppErrorSheet onRetry={this.retry} />
    ) : (
      this.props.children
    );
  }
}
