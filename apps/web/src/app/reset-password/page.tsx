import { IdentityActionForm } from "@/components/IdentityActionForm";
import { initialIdentityToken } from "@/lib/identity-actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <IdentityActionForm
      action="reset"
      initialToken={initialIdentityToken(token)}
    />
  );
}
