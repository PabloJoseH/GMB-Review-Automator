import { HeroSection } from "@/components/website/hero-section";
import { SocialProofSection } from "@/components/website/social-proof-section";
import { HowItWorksSection } from "@/components/website/how-it-works-section";
import { WhatsAppDemoSection } from "@/components/website/whatsapp-demo-section";
import { FeaturesSection } from "@/components/website/features-section";
import { ReviewImpactSection } from "@/components/website/review-impact-section";
import { PricingSection } from "@/components/website/pricing-section";
import { FaqSection } from "@/components/website/faq-section";
import { CtaSection } from "@/components/website/cta-section";
import { getWhatsAppPhoneNumber } from "@/server/actions/supabase/global-config.action";

type Props = {
  params: Promise<{ locale: string }>;
};

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
 * Home Page (Landing) - SSG
 * Main landing page with all sections.
 */
export default async function HomePage({ params }: Props) {
  await params;
  const whatsappUrl = await getWhatsAppUrl();

  return (
    <main>
      <HeroSection whatsappUrl={whatsappUrl} />
      <SocialProofSection />
      <HowItWorksSection />
      <WhatsAppDemoSection />
      <FeaturesSection />
      <ReviewImpactSection />
      <PricingSection whatsappUrl={whatsappUrl} />
      <FaqSection />
      <CtaSection whatsappUrl={whatsappUrl} />
    </main>
  );
}
