"use client";

import { useSearchParams } from "next/navigation";
import { LoginFormBody } from "./_content";
import { readLoginSearchParams } from "./login-form-params";

export function LoginForm() {
  const searchParams = useSearchParams();
  return (
    <LoginFormBody loginSearchParams={readLoginSearchParams(searchParams)} />
  );
}
