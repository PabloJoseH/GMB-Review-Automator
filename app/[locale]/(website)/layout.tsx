import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/website/header";
import { Footer } from "@/components/website/footer";
import { getWhatsAppPhoneNumber, getCurrentYear } from "@/server/actions/supabase/global-config.action";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Generates static params for all supported locales.
 * Enables SSG (Static Site Generation) for public website routes.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Gets WhatsApp URL from active global config.
 * Returns formatted URL for WhatsApp links.
 */
async function getWhatsAppUrl(): Promise<string> {
  const whatsappResult = await getWhatsAppPhoneNumber();
  const whatsappNumber = whatsappResult.success && whatsappResult.data ? whatsappResult.data : null;
  return whatsappNumber ? `https://wa.me/${whatsappNumber}` : 'https://wa.me/';
}

/**
 * Website layout for public landing pages (SSG).
 * 
 * Provides Header and Footer for all website pages.
 * setRequestLocale() enables static generation for website routes.
 */
export default async function WebsiteLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  
  const whatsappUrl = await getWhatsAppUrl();
  const currentYear = await getCurrentYear();

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header whatsappUrl={whatsappUrl} />
      {children}
      <Footer currentYear={currentYear} />
    </div>
  );
}
