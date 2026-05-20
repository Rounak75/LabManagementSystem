import { LoginForm } from "./LoginForm";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="max-w-md mx-auto pt-4 pb-10">
      <h1 className="text-[28px] sm:text-[32px] font-heading font-bold tracking-tighter text-text leading-[1.1]">
        Open your reports
      </h1>
      <p className="text-[14px] text-soft mt-3 leading-relaxed">
        Sign in with the phone number you registered with and the 6-character
        code printed on your most recent receipt.
      </p>
      <div className="mt-6">
        <LoginForm nextUrl={searchParams.next ?? "/dashboard"} />
      </div>
    </div>
  );
}
