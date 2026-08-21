import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#c2c2c2] px-6 py-12 text-zinc-950">
      <section className="w-full max-w-xl rounded-3xl border border-zinc-950 bg-[#c2c2c2] p-8 shadow-sm sm:p-12">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
          AI Assistant
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Welcome back.
        </h1>
        <p className="mt-5 max-w-md text-lg leading-8 text-zinc-600">
          Start a conversation with your AI assistant whenever you are ready.
        </p>
        <Link
          href="/dashboard/projects"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-zinc-950 px-6 font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
        >
          Open chat
        </Link>
      </section>
    </main>
  );
}
