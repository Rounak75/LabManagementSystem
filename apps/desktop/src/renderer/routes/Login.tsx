import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/stores/auth.store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ username: string; password: string }>();
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(v: any) {
    setError(null);
    try { await login(v.username, v.password); nav("/"); }
    catch (e: any) { setError(e.message); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold text-brand">Sign in</h1>
        <p className="mb-6 text-xs text-slate-500">Golmuri Janch Ghar</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Username" autoFocus {...register("username", { required: "required" })} error={errors.username?.message} />
          <Input label="Password" type="password" {...register("password", { required: "required" })} error={errors.password?.message} />
          <div className="-mt-2 text-right">
            <Link to="/recover" className="text-xs text-slate-500 hover:text-brand hover:underline">Forgot password?</Link>
          </div>
          {error && <div className="text-sm text-danger">{error}</div>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</Button>
        </form>
      </Card>
    </div>
  );
}
