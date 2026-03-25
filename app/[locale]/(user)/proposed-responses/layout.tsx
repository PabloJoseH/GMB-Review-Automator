import type { ReactNode } from "react";

interface ProposedResponsesLayoutProps {
  children: ReactNode;
}

/**
 * Proposed Responses Layout - Layout for Proposed Responses Page
 * 
 * Handles the page-specific container and spacing for the proposed responses page.
 * Authentication and common UI elements (header, footer) are handled by the parent (user) layout.
 * 
 * This layout provides:
 * - Page container with max-width and padding
 * - Top padding to account for fixed header (128px = 64px + 64px for UserHeader + SelectionHeader)
 */
export default function ProposedResponsesLayout({ children }: ProposedResponsesLayoutProps) {
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col h-full px-4 py-0">
      <div className="flex-1 pt-32">
        {children}
      </div>
    </div>
  );
}

