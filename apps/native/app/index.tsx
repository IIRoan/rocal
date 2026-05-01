import { Redirect } from "expo-router";
import { useAuth } from "../src/providers/AuthProvider";
import {
  AUTH_SIGN_IN_ROUTE,
  CALENDAR_HOME_ROUTE,
} from "../src/lib/auth-routing";

export default function IndexScreen() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  return (
    <Redirect
      href={isAuthenticated ? CALENDAR_HOME_ROUTE : AUTH_SIGN_IN_ROUTE}
    />
  );
}
