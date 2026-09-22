"use client";

import type { LucideIcon } from "lucide-react";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AtSign,
  Bell,
  BellOff,
  Bold,
  Calendar,
  Check,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clipboard,
  Clock,
  Cloud,
  Copy,
  Download,
  Expand,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FilePlus,
  Filter,
  Flag,
  Folder,
  FolderInput,
  Forward,
  Globe,
  Heart,
  CircleHelp,
  Home,
  Image,
  Inbox,
  Info,
  Italic,
  Link,
  Lock,
  Mail,
  MailOpen,
  Maximize2,
  Menu,
  Minus,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Paperclip,
  Pause,
  Pen,
  SquarePen,
  Play,
  Plus,
  PlusCircle,
  Printer,
  Redo,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Square,
  Star,
  Sun,
  Tag,
  Trash2,
  Underline,
  Undo,
  Unlock,
  Upload,
  User,
  UserPlus,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";

import { getIconColorValue } from "./color-utils";
import { Size } from "./types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { Icon, ICON_SIZE, type IconColor } from "./icons.constants";

const ICON_MAP: Partial<Record<Icon, LucideIcon>> = {
  [Icon.At]: AtSign,
  [Icon.Archive]: Archive,
  [Icon.ArrowDown]: ArrowDown,
  [Icon.ArrowLeft]: ArrowLeft,
  [Icon.ArrowRight]: ArrowRight,
  [Icon.ArrowUp]: ArrowUp,
  [Icon.Bell]: Bell,
  [Icon.BellSlash]: BellOff,
  [Icon.Bold]: Bold,
  [Icon.Calendar]: Calendar,
  [Icon.Check]: Check,
  [Icon.CheckCircle]: CheckCircle,
  [Icon.CheckboxEmpty]: Square,
  [Icon.CheckboxFilled]: CheckSquare,
  [Icon.ChevronDown]: ChevronDown,
  [Icon.ChevronLeft]: ChevronLeft,
  [Icon.ChevronRight]: ChevronRight,
  [Icon.ChevronUp]: ChevronUp,
  [Icon.Clipboard]: Clipboard,
  [Icon.Clock]: Clock,
  [Icon.ClockSlash]: Clock,
  [Icon.Close]: X,
  [Icon.Cloud]: Cloud,
  [Icon.Compose]: SquarePen,
  [Icon.Copy]: Copy,
  [Icon.Download]: Download,
  [Icon.Dot]: Circle,
  [Icon.Edit]: Pen,
  [Icon.Envelope]: Mail,
  [Icon.EnvelopeFilled]: Mail,
  [Icon.EnvelopeRead]: MailOpen,
  [Icon.EnvelopeUnread]: Mail,
  [Icon.Expand]: Expand,
  [Icon.ExternalLink]: ExternalLink,
  [Icon.Eye]: Eye,
  [Icon.EyeSlash]: EyeOff,
  [Icon.File]: File,
  [Icon.FilePlus]: FilePlus,
  [Icon.Filter]: Filter,
  [Icon.Flag]: Flag,
  [Icon.Folder]: Folder,
  [Icon.FolderArrow]: FolderInput,
  [Icon.Forward]: Forward,
  [Icon.ForwardEmail]: Forward,
  [Icon.Globe]: Globe,
  [Icon.Heart]: Heart,
  [Icon.Home]: Home,
  [Icon.Image]: Image,
  [Icon.Inbox]: Inbox,
  [Icon.Info]: Info,
  [Icon.Italic]: Italic,
  [Icon.Link]: Link,
  [Icon.Lock]: Lock,
  [Icon.Mailbox]: Inbox,
  [Icon.Menu]: Menu,
  [Icon.Minus]: Minus,
  [Icon.Moon]: Moon,
  [Icon.MoveMailbox]: FolderInput,
  [Icon.OverflowH]: MoreHorizontal,
  [Icon.OverflowV]: MoreVertical,
  [Icon.PaperClip]: Paperclip,
  [Icon.Pause]: Pause,
  [Icon.Play]: Play,
  [Icon.Plus]: Plus,
  [Icon.PlusCircle]: PlusCircle,
  [Icon.PopOut]: Maximize2,
  [Icon.Printer]: Printer,
  [Icon.QuestionCircle]: CircleHelp,
  [Icon.Redo]: Redo,
  [Icon.Reload]: RefreshCw,
  [Icon.Reply]: Reply,
  [Icon.ReplyAll]: ReplyAll,
  [Icon.Search]: Search,
  [Icon.Send]: Send,
  [Icon.Settings]: Settings,
  [Icon.ShieldCheck]: ShieldCheck,
  [Icon.Smile]: Smile,
  [Icon.Spam]: Flag,
  [Icon.Star]: Star,
  [Icon.Sun]: Sun,
  [Icon.Tag]: Tag,
  [Icon.Trash]: Trash2,
  [Icon.Underline]: Underline,
  [Icon.Undo]: Undo,
  [Icon.Unlock]: Unlock,
  [Icon.Upload]: Upload,
  [Icon.User]: User,
  [Icon.UserPlus]: UserPlus,
  [Icon.Warning]: Info,
  [Icon.XCircle]: XCircle,
  [Icon.ZoomMinus]: ZoomOut,
  [Icon.ZoomPlus]: ZoomIn,
};

export interface IconProps {
  icon: Icon;
  dataTest?: string;
  disabled?: boolean;
  color?: IconColor;
  rotate?: number;
  size?: Size | number;
  tooltip?: string;
  className?: string;
  onClick?: (event: React.MouseEvent) => void | Promise<void>;
}

export default function Icons({
  icon,
  dataTest,
  disabled,
  color = "primary",
  rotate,
  size = Size.MEDIUM,
  tooltip,
  className,
  onClick,
}: IconProps) {
  const Glyph = ICON_MAP[icon] ?? Circle;
  const pixelSize = typeof size === "number" ? size : ICON_SIZE[size];
  const classNames = cn(
    "inline-flex shrink-0 items-center justify-center",
    onClick && !disabled && "cursor-pointer",
    disabled && "pointer-events-none",
    className,
  );
  const style = {
    width: pixelSize,
    height: pixelSize,
    color: getIconColorValue(color),
    transform: rotate ? `rotate(${rotate}deg)` : undefined,
  };
  const glyph = <Glyph size={pixelSize} strokeWidth={2} aria-hidden />;
  const node =
    onClick && !disabled ? (
      <button
        type="button"
        data-test={dataTest}
        aria-label={tooltip || icon}
        className={classNames}
        style={style}
        onClick={onClick}
      >
        {glyph}
      </button>
    ) : (
      <span data-test={dataTest} className={classNames} style={style}>
        {glyph}
      </span>
    );

  if (!tooltip) return node;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{node}</span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export { Icons };
export type { IconProps as IconsProps };
