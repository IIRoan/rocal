"use client";

import { SolaceAvatar } from "../solace-avatar";

export function SenderAvatar({
  email,
  name,
  className,
}: {
  email: string;
  name?: string;
  className?: string;
}) {
  return (
    <SolaceAvatar
      email={email}
      name={name}
      className={className}
      title={name || email}
    />
  );
}
