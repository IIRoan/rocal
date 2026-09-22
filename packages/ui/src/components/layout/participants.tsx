"use client";

import Image from "next/image";
import { Button } from "../ui/button";
import { Ellipsis } from "lucide-react";

const AVATARS = [
  {
    src: "https://raw.githubusercontent.com/origin-space/origin-images/refs/heads/main/exp1/avatar-40-16_zn3ygb.jpg",
    alt: "Avatar 01",
  },
  {
    src: "https://raw.githubusercontent.com/origin-space/origin-images/refs/heads/main/exp1/avatar-40-10_qyybkj.jpg",
    alt: "Avatar 02",
  },
  {
    src: "https://raw.githubusercontent.com/origin-space/origin-images/refs/heads/main/exp1/avatar-40-15_fguzbs.jpg",
    alt: "Avatar 03",
  },
  {
    src: "https://raw.githubusercontent.com/origin-space/origin-images/refs/heads/main/exp1/avatar-40-11_jtjhsp.jpg",
    alt: "Avatar 04",
  },
] as const;

export function Participants() {
  return (
    <div className="flex *:not-first:-ml-[0.45rem]">
      {AVATARS.map((avatar) => (
        <Image
          key={avatar.alt}
          className="ring-background rounded-full ring-1"
          src={avatar.src}
          width={24}
          height={24}
          alt={avatar.alt}
        />
      ))}
      <Button
        variant="outline"
        className="flex size-6 items-center justify-center rounded-full text-xs ring-1 ring-background border-transparent shadow-none text-muted-foreground/80 dark:bg-background dark:hover:bg-background dark:border-transparent"
        size="icon"
      >
        <span className="size-4">
          <Ellipsis size={16} />
        </span>
      </Button>
    </div>
  );
}
