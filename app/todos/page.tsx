import { cookies } from "next/headers";

import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos, error } = await supabase.from("todos").select();

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-[family-name:var(--font-instrument)] text-3xl">
          Supabase
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          Client is wired to this project. The <code>todos</code> table is not
          available yet ({error.message}).
        </p>
      </main>
    );
  }

  return (
    <ul>
      {todos?.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  );
}
