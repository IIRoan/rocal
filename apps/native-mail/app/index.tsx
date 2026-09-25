import { Redirect } from "expo-router";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { AUTH_SIGN_IN_ROUTE } from "@workspace/native-core/lib/auth-routing";
import { MAIL_HOME_ROUTE } from "../src/lib/mail-routes";

export default function IndexScreen() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  return (
    <Redirect href={isAuthenticated ? MAIL_HOME_ROUTE : AUTH_SIGN_IN_ROUTE} />
  );
}
