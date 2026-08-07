import { LoginForm } from "./LoginForm";
import { Band, Container } from "@portal/components/ui";

export default async function LoginPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await searchParamsPromise;
  return (
    <>
      <Band waves className="pb-16">
        <Container className="pt-8">
          <div className="mx-auto max-w-md text-center">
            <p className="rise text-[12px] font-semibold uppercase tracking-[0.18em] text-band/60">
              Patient sign-in
            </p>
            <h1
              className="rise mt-3 font-heading text-[30px] font-extrabold leading-[1.08] tracking-tighter text-band sm:text-[36px]"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              Open your reports
            </h1>
            <p
              className="rise mt-3 text-[14px] leading-relaxed text-band/70"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              Sign in with the phone number you registered with and your patient
              ID — or your password, once you have set one.
            </p>
          </div>
        </Container>
      </Band>

      <Container>
        <div className="mx-auto -mt-8 max-w-md">
          <LoginForm nextUrl={searchParams.next ?? "/dashboard"} />
        </div>
      </Container>
    </>
  );
}
