"use client";

import { useState, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, HelpCircle } from "lucide-react";
import { updateOrganizationOnboarding } from "@/server/actions/clerk/organizationMemberships.action";
import { updateUserOnboardingStatus, updateUser } from "@/server/actions/supabase/users.action";
import { PhoneInput } from "@/components/onboarding/phone-input";
import { CountrySelect } from "@/components/onboarding/country-select";
import * as RPNInput from "react-phone-number-input";
import { useLocale } from "next-intl";
import { ErrorBanner } from "./ErrorBanner";
import { ReauthLink } from "./reauth-link";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { createLogger } from "@/lib/logger";

const logger = createLogger('ORGANIZATION-FORM');

interface OrganizationFormProps {
  userEmail: string;
  userId: string;
  userInfoData?: {
    name: string;
    lastname: string;
    email: string;
    phone: string;
  } | null;
  existingData?: {
    businessName: string;
    businessId: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    taxId?: string;
  } | null;
  errorBannerName?: string | undefined;
}

export function OrganizationForm({ userEmail, userId, userInfoData = null, existingData = null, errorBannerName = undefined }: OrganizationFormProps) {
  const router = useRouter();
  const t = useTranslations("onboarding.step1.form");
  const tUserInfo = useTranslations("onboarding.step1.userInfo.form");
  const tUserInfoTitle = useTranslations("onboarding.step1.userInfo");
  const locale = useLocale();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set default country based on locale
  const defaultCountry = locale === "es" ? "ES" : "US";

  // Parse user phone number to E.164 format and detect country for default value
  const { parsedUserPhone, detectedUserCountry } = useMemo(() => {
    if (!userInfoData?.phone) {
      return { parsedUserPhone: "", detectedUserCountry: defaultCountry };
    }

    let phoneToParse = userInfoData.phone.trim();
    
    if (!phoneToParse.startsWith('+')) {
      const parsed = parsePhoneNumberFromString(phoneToParse);
      if (parsed && parsed.isValid()) {
        return {
          parsedUserPhone: parsed.format('E.164'),
          detectedUserCountry: parsed.country || defaultCountry
        };
      }
      
      const parsedWithCountry = parsePhoneNumberFromString(phoneToParse, defaultCountry as CountryCode);
      if (parsedWithCountry && parsedWithCountry.isValid()) {
        return {
          parsedUserPhone: parsedWithCountry.format('E.164'),
          detectedUserCountry: parsedWithCountry.country || defaultCountry
        };
      }
      
      phoneToParse = `+${phoneToParse}`;
    }

    try {
      const parsed = parsePhoneNumberFromString(phoneToParse);
      if (parsed && parsed.isValid()) {
        return {
          parsedUserPhone: parsed.format('E.164'),
          detectedUserCountry: parsed.country || defaultCountry
        };
      }
    } catch {
      // Parsing failed
    }

    return {
      parsedUserPhone: phoneToParse.startsWith('+') ? phoneToParse : `${phoneToParse}`,
      detectedUserCountry: defaultCountry
    };
  }, [userInfoData?.phone, defaultCountry]);

  // Create schema with translated messages (includes user info fields)
  const organizationSchema = z.object({
    // User info fields
    userName: z.string()
      .min(2, tUserInfo("name.minLength")),
    userLastname: z.string()
      .min(2, tUserInfo("lastname.minLength")),
    userEmail: z.string()
      .email(tUserInfo("email.invalid")),
    userPhone: z.string()
      .optional()
      .refine((val) => {
        if (!val) return true;
        return parsePhoneNumberFromString(val)?.isValid() ?? false;
      }, tUserInfo("phone.invalid")),
    // Organization fields
    businessName: z.string()
      .min(2, t("businessName.minLength")),
    businessId: z.string()
      .min(1, t("businessId.required")),
    taxId: z.string()
      .optional(),
    email: z.string()
      .email(t("email.invalid")),
    phone: z.string()
      .optional()
      .refine((val) => {
        if (!val) return true;
        return parsePhoneNumberFromString(val)?.isValid() ?? false;
      }, t("phone.invalid")),
    address: z.string()
      .min(5, t("address.minLength")),
    city: z.string()
      .min(2, t("city.minLength")),
    state: z.string()
      .min(2, t("state.minLength")),
    country: z.string()
      .min(2, t("country.minLength"))
      .max(50, t("country.invalid")),
    postalCode: z.string()
      .min(1, t("postalCode.required")),
  });

  type OrganizationFormData = z.infer<typeof organizationSchema>;

  const form = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      // User info defaults
      userName: userInfoData?.name || "",
      userLastname: userInfoData?.lastname || "",
      userEmail: userInfoData?.email || userEmail,
      userPhone: parsedUserPhone || "",
      // Organization defaults
      businessName: existingData?.businessName || "",
      businessId: existingData?.businessId || "",
      taxId: existingData?.taxId || "",
      email: existingData?.email || userEmail,
      phone: existingData?.phone ? (existingData.phone.startsWith('+') ? existingData.phone : `+${existingData.phone}`) : "",
      address: existingData?.address || "",
      city: existingData?.city || "",
      state: existingData?.state || "",
      country: existingData?.country || defaultCountry,
      postalCode: existingData?.postalCode || "",
    },
  });


  const onSubmit = async (data: OrganizationFormData) => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      const toDBFormat = (e164: string): string => {
        if (!e164) return "";
        const parsed = parsePhoneNumberFromString(e164);
        return parsed?.isValid() ? `${parsed.countryCallingCode}${parsed.nationalNumber}` : e164.replace(/\+/g, '');
      };
      
      // Step 1: Update user information first
      // Note: userEmail and userPhone (wa_id) are disabled
      const userUpdateResult = await updateUser(userId, {
        name: data.userName,
        lastname: data.userLastname,
        // email and wa_id are intentionally excluded for security
      });

      if (!userUpdateResult.success) {
        setError(userUpdateResult.error || t("errors.generic"));
        setIsSubmitting(false);
        return;
      }

      // Step 2: Update organization
      const orgResult = await updateOrganizationOnboarding({
        businessName: data.businessName,
        businessId: data.businessId,
        taxId: data.taxId || undefined, // Only send if provided, undefined if empty
        email: data.email,
        phone: toDBFormat(data.phone || ""),
        postalCode: data.postalCode,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
      });
      
      if (!orgResult.success) {
        const errorMessage = orgResult.error === 'BUSINESS_ID_TAKEN'
          ? t("errors.businessIdTaken")
          : (orgResult.error || t("errors.generic"));
        setError(errorMessage);
        setIsSubmitting(false);
        return;
      }

      // Step 3: Update onboarding status
      await updateUserOnboardingStatus(userId, 'onLocationPage');

      // Step 4: Navigate to step 2
      router.push("/onboarding/step-2");
    } catch (error) {
      logger.error("Error saving form", error instanceof Error ? error : new Error(String(error)));
      setError(t("errors.generic"));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-600">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {errorBannerName && <ErrorBanner error_banner_name={errorBannerName} />}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* User Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>👤</span>
                {tUserInfoTitle("title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Name and Lastname Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="userName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tUserInfo("name.label")}</FormLabel>
                      <FormControl>
                        <Input placeholder={tUserInfo("name.placeholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="userLastname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tUserInfo("lastname.label")}</FormLabel>
                      <FormControl>
                        <Input placeholder={tUserInfo("lastname.placeholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Email and Phone Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="userEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tUserInfo("email.label")}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={tUserInfo("email.placeholder")} {...field} disabled />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="userPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tUserInfo("phone.label")}</FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value ?? ""}
                          onChange={(value) => field.onChange(value)}
                          defaultCountry={detectedUserCountry as RPNInput.Country}
                          placeholder={tUserInfo("phone.placeholder")}
                          disabled
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {tUserInfo("phone.disabledDescription")}
              </p>
            </CardContent>
          </Card>

          {/* Organization Form Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🏢</span>
                Información de la Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Business Name */}
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("businessName.label")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder={t("businessName.placeholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Business ID, Tax ID and Email Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="businessId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("businessId.label")} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder={t("businessId.placeholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="taxId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormLabel>{t("taxId.label")}</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">{t("taxId.description")}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        <Input placeholder={t("taxId.placeholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Email and Phone Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("email.label")} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t("email.placeholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("phone.label")}</FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value ?? ""}
                          onChange={(value) => field.onChange(value)}
                          defaultCountry={(((form.watch("country") ?? defaultCountry) as string).toUpperCase() as RPNInput.Country)}
                          placeholder={t("phone.placeholder")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Address and Postal Code Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="md:col-span-3">
                      <FormLabel>{t("address.label")} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder={t("address.placeholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem className="md:col-span-1">
                      <FormLabel>{t("postalCode.label")} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder={t("postalCode.placeholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* City, State, Country Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("city.label")} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder={t("city.placeholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("state.label")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("state.placeholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("country.label")} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <CountrySelect
                          value={field.value || defaultCountry}
                          onValueChange={field.onChange}
                          placeholder={t("country.placeholder")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="space-y-4 pt-6">
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full h-14 cursor-pointer transition-all active:scale-[0.98] hover:shadow-md hover:-translate-y-0.5 bg-[var(--active)] hover:bg-[var(--active)]/90 text-[var(--active-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--active)]/30"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("submit.loading")}
                </>
              ) : (
                t("submit.button")
              )}
            </Button>
            <div className="pt-4">
              <ReauthLink userId={userId} align="left" />
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

