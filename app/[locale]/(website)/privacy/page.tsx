type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * Privacy Policy Page - SSG
 * Displays the privacy policy and data protection information.
 */
export default async function PrivacyPage({ params }: Props) {
  await params;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <article className="prose prose-slate dark:prose-invert max-w-none">
        <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
          Privacy Policy – Local Responder
        </h1>

        <p className="leading-7 [&:not(:first-child)]:mt-6 text-muted-foreground">
          <strong>NUMA LABS LLC</strong>
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6 text-muted-foreground">
          Last Updated: November 1, 2025
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
          1. Introduction
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          This Privacy Policy explains how Local Responder, operated by NUMA LABS LLC, collects and processes personal information when you use our platform. Local Responder allows businesses to connect their Google Business Profile, analyze new reviews and respond to them automatically using AI.
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          By signing up or using Local Responder, you agree to this Privacy Policy.
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          2. Data Controller
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          <strong>NUMA LABS LLC</strong>
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          State of Incorporation: Wyoming, United States
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Address: 407 Lincoln Road #708, Miami Beach, FL 33139, USA
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Email: talk@numa-labs.com
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          3. Information We Collect
        </h2>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          3.1. Google Account Information (via OAuth)
        </h3>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          When you log in with Google, and only after explicit authorization, we receive:
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>First name</li>
          <li>Last name</li>
          <li>Email address</li>
          <li>Google profile picture (avatar)</li>
        </ul>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We do not access any other Google data unless explicitly requested by you.
        </p>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          3.2. Google Business Profile Data (scope: https://www.googleapis.com/auth/business.manage)
        </h3>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          With your permission, Local Responder accesses:
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Your Google Business Profile locations</li>
          <li>New and recent customer reviews</li>
          <li>Ability to publish review responses on your behalf</li>
        </ul>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          This access is strictly necessary to provide our service.
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We never modify or delete any other data.
        </p>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          3.3. User Information Provided Directly to Us
        </h3>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          You may provide:
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Phone number (for WhatsApp notifications)</li>
          <li>Business name</li>
          <li>Billing details (organization name, email, address, tax/VAT number if required)</li>
        </ul>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          3.4. Technical and Usage Data
        </h3>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We automatically collect minimal operational data:
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Device and browser information</li>
          <li>Login session cookies</li>
          <li>Performance logs (for debugging)</li>
        </ul>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          3.5. Cookies
        </h3>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Local Responder uses:
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Essential cookies (authentication, session management)</li>
          <li>Analytics cookies (Google Analytics 4)</li>
        </ul>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Used to understand feature usage and improve the product.
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          You can disable analytics cookies at any time.
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          4. How We Use Your Information
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We process your data exclusively to operate and improve Local Responder. This includes:
        </p>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          4.1. Service Delivery
        </h3>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Authenticating your account</li>
          <li>Fetching your latest Google reviews</li>
          <li>Generating review summaries</li>
          <li>Creating AI-generated responses</li>
          <li>Publishing responses on your behalf</li>
        </ul>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          4.2. Account & Subscription Management
        </h3>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Managing your subscription (upgrade, downgrade, cancellation)</li>
          <li>Providing access during the 15-day free trial</li>
          <li>Sending important service notifications</li>
        </ul>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          4.3. Billing (via Stripe)
        </h3>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Stripe acts as our payment processor and processes all payments securely.
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We do not store credit card numbers or payment details.
        </p>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          4.4. Product Improvement
        </h3>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Feature performance measurement</li>
          <li>Diagnosis of errors</li>
          <li>Aggregated analytics</li>
        </ul>

        <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
          4.5. Legal & Security
        </h3>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Detecting fraudulent activity</li>
          <li>Compliance with tax or legal obligations</li>
        </ul>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          5. Legal Basis for Processing (if applicable under GDPR)
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Depending on your location, the legal basis may include:
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Contract performance (providing the service you signed up for)</li>
          <li>Consent (Google OAuth, analytics cookies)</li>
          <li>Legitimate interest (service improvement, security)</li>
          <li>Legal obligation (billing and tax compliance via Stripe)</li>
        </ul>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          6. Data Retention
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We retain your data only for as long as necessary to deliver the service.
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Account data: until your account is deleted</li>
          <li>Review data: for operational purposes only, removed on account deletion</li>
          <li>OAuth tokens: revoked immediately upon disconnection</li>
        </ul>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Billing records may be retained as required by tax law.
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          7. Data Sharing
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We only share data with:
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Stripe (billing, tax compliance)</li>
          <li>Verified infrastructure providers (hosting, storage, analytics)</li>
          <li>Authorities where legally required</li>
        </ul>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We never sell or rent your information.
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          8. International Data Transfers
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          As we operate from the United States, your data may be processed in the USA or in other jurisdictions where our service providers operate. We implement reasonable safeguards to protect international transfers.
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          9. Security
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We take appropriate technical and organizational measures to protect your information, including:
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Encrypted storage</li>
          <li>HTTPS encryption for all traffic</li>
          <li>Limited access on a need-to-know basis</li>
        </ul>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          No system is completely secure, but we make reasonable efforts to keep your data safe.
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          10. Your Rights
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Depending on your jurisdiction, you may have rights to:
        </p>

        <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
          <li>Access your data</li>
          <li>Correct inaccurate information</li>
          <li>Delete your account</li>
          <li>Withdraw consent (Google OAuth or analytics)</li>
          <li>Export your data</li>
          <li>Submit a complaint to a data authority</li>
        </ul>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          You can exercise these rights by emailing talk@numa-labs.com.
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          11. Children&apos;s Privacy
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Local Responder is not intended for minors under 16 and we do not knowingly collect information from minors.
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          12. Changes to This Policy
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          We may update this Privacy Policy due to regulatory or operational changes. The latest version will always be available on our website.
        </p>

        <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors">
          13. Contact
        </h2>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          For questions about this Privacy Policy or your data:
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          <strong>NUMA LABS LLC</strong>
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          407 Lincoln Road #708, Miami Beach, FL 33139, United States
        </p>

        <p className="leading-7 [&:not(:first-child)]:mt-6">
          Email: talk@numa-labs.com
        </p>
      </article>
    </div>
  );
}

