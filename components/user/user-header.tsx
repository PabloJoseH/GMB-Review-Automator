import { MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { UserMenu } from "./user-menu";
import { APP_CONSTANTS } from "@/lib/constants";

interface UserHeaderProps {
  userName?: string;
  userEmail?: string;
  userImageUrl?: string;
}

export function UserHeader({ userName, userEmail, userImageUrl }: UserHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full border-b border-border/40 bg-background h-16">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-end gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center space-x-2 transition-opacity hover:opacity-80 mr-auto">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-xl font-bold text-transparent">
            {APP_CONSTANTS.brand.companyName}
          </span>
        </Link>
        <UserMenu 
          userName={userName}
          userEmail={userEmail}
          userImageUrl={userImageUrl}
        />
      </div>
    </header>
  );
}
