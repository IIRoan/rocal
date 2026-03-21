import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "../../lib/utils";

interface MobileAuthCardProps {
  appName?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  loading?: boolean;
  error?: string | null;
  footer?: string;
  onSubmit?: () => void;
}

export function MobileAuthCard({
  appName = "Rocani Mobile",
  title = "Sign in",
  subtitle = "Continue with GitHub. Password sign-in is disabled on mobile.",
  ctaLabel = "Continue with GitHub",
  loading = false,
  error = null,
  footer = "Your account is created automatically the first time you sign in with GitHub.",
  onSubmit,
}: MobileAuthCardProps) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "right", "bottom", "left"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="relative flex-1 justify-center bg-background px-6 py-8">
          <View className="absolute right-[-40px] top-[88px] size-[180px] rounded-full bg-primary/15" />
          <View className="gap-6 rounded-[28px] border border-border bg-card p-6 shadow-sm">
            <View className="gap-2">
              <Text className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                {appName}
              </Text>
              <Text className="text-[32px] font-bold text-foreground">{title}</Text>
              <Text className="text-[15px] leading-[22px] text-muted-foreground">{subtitle}</Text>
            </View>

            <View className="gap-3">
              {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={onSubmit}
                className="min-h-11 items-center justify-center rounded-[18px] bg-primary px-4"
                style={({ pressed }) => ({
                  opacity: loading ? 0.7 : pressed ? 0.9 : 1,
                })}
              >
                <Text
                  className={cn(
                    "text-base font-bold text-primary-foreground",
                    loading && "opacity-90"
                  )}
                >
                  {loading ? "Connecting…" : ctaLabel}
                </Text>
              </Pressable>
            </View>

            <View className="items-center justify-center">
              <Text className="text-center text-sm leading-5 text-muted-foreground">{footer}</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
