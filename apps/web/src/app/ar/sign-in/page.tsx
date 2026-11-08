import { SignInPage, signInMetadata, type SignInPageProps } from "../../../components/sign-in-page";

export function generateMetadata({ searchParams }: SignInPageProps) {
  return signInMetadata({ locale: "ar", searchParams });
}

export default function ArabicSignIn({ searchParams }: SignInPageProps) {
  return <SignInPage locale="ar" searchParams={searchParams} />;
}
