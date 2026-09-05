import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 max-w-md text-sm opacity-70">
        The page you are looking for does not exist or was moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
