import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#c2c2c2] px-6 py-12">
      <SignIn />
    </main>
  );
}
