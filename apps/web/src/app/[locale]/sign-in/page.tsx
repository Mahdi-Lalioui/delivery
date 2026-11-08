import { SignInPage, signInMetadata, type SignInPageProps } from "../../../components/sign-in-page";
import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";

type Props = SignInPageProps & LatinPageProps;

export async function generateMetadata({ params, searchParams }: Props) {
  return signInMetadata({ locale: await requireLatinLocale({ params }), searchParams });
}

export default async function LatinSignIn({ params, searchParams }: Props) {
  return <SignInPage locale={await requireLatinLocale({ params })} searchParams={searchParams} />;
}
