"use client";

import {
  ChevronsUpDown,
  LogOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/server/actions/clerk/users.action";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface UserMenuProps {
  userName?: string;
  userEmail?: string;
  userImageUrl?: string;
}

/**
 * UserMenu Component
 * 
 * Displays user avatar, name, email, and logout option.
 * Receives user data as props from parent Server Component.
 * Uses server action for sign out.
 */
export function UserMenu({ userName, userEmail, userImageUrl }: UserMenuProps) {
  const t = useTranslations("backoffice.nav.user");

  const displayName = userName || "User";
  const email = userEmail || "No email";

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-10 items-center gap-2 px-2 hover:bg-accent"
        >
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarImage src={userImageUrl} alt={displayName} />
            <AvatarFallback className="rounded-lg">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex sm:flex-col sm:items-start">
            <span className="text-sm font-medium">{displayName}</span>
            <span className="text-xs text-muted-foreground">{email}</span>
          </div>
          <ChevronsUpDown className="ml-auto hidden sm:block size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        align="end"
        forceMount
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={signOutAction} className="w-full">
            <button type="submit" className="w-full flex items-center cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>{t("logout")}</span>
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

