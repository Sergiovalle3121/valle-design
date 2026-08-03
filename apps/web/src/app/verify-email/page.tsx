import { IdentityActionForm } from "@/components/IdentityActionForm";
import { initialIdentityToken } from "@/lib/identity-actions";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <IdentityActionForm
      action="verify"
      initialToken={initialIdentityToken(token)}
    />
  );
}
