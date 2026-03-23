import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type NativeErrorBoundaryProps = {
  children: React.ReactNode;
  label?: string;
};

type NativeErrorBoundaryState = {
  error: Error | null;
};

export class NativeErrorBoundary extends React.Component<
  NativeErrorBoundaryProps,
  NativeErrorBoundaryState
> {
  state: NativeErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): NativeErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[native-error-boundary:${this.props.label ?? 'screen'}]`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'right', 'bottom', 'left']}>
        <View className="flex-1 bg-background px-6 py-8">
          <View className="rounded-3xl border border-destructive/30 bg-card p-5">
            <Text className="text-[11px] font-bold uppercase tracking-[0.15em] text-destructive">
              Render failure
            </Text>
            <Text className="mt-2 text-2xl font-extrabold text-foreground">
              Calendar screen crashed
            </Text>
            <Text className="mt-2 text-sm text-muted-foreground">
              A runtime render error was caught instead of leaving the app on a black screen.
            </Text>

            <Pressable
              className="mt-5 min-h-11 items-center justify-center rounded-2xl bg-primary px-4"
              onPress={this.handleRetry}
            >
              <Text className="text-sm font-bold text-primary-foreground">Retry</Text>
            </Pressable>

            <ScrollView className="mt-5 max-h-64 rounded-2xl bg-muted/35 p-3">
              <Text className="font-mono text-xs text-foreground">
                {this.state.error.stack || this.state.error.message}
              </Text>
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    );
  }
}
