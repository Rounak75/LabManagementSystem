import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-semibold mb-1">Golmuri Janch Ghar</h1>
        <p className="text-sm text-gray-600 mb-6">Staff Admin Portal</p>
        <LoginForm />
      </div>
    </main>
  );
}
