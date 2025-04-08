import { TutorialStep } from "./tutorial-step";
import { CodeBlock } from "./code-block";
import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'

const create = `create table notes (
  id bigserial primary key,
  title text
);

insert into notes(title)
values
  ('Today I created a Supabase project.'),
  ('I added some data and queried it from Next.js.'),
  ('It was awesome!');
`.trim();

const server = `import { createClient } from '@/utils/supabase/server'

export default async function Page() {
  const supabase = await createClient()
  const { data: notes } = await supabase.from('notes').select()

  return <pre>{JSON.stringify(notes, null, 2)}</pre>
}
`.trim();

const client = `'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'

export default function Page() {
  const [todos, setTodos] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const supabase = createClient();
  
  useEffect(() => {
    fetchTodos();
  }, []);
  
  const fetchTodos = async () => {
    setIsRefreshing(true);
    
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('id', { ascending: false });
        
      if (error) {
        throw error;
      }
      
      setTodos(data || []);
    } catch (error) {
      console.error('Error fetching todos:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return <pre>{JSON.stringify(todos, null, 2)}</pre>
}
`.trim();

export function FetchDataSteps() {
  const [todos, setTodos] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase.from('todos').select('*');
        if (error) {
          console.error('Error fetching todos:', error);
          return;
        }
        setTodos(data || []);
      } catch (error) {
        console.error('Exception when fetching todos:', error);
      }
    };

    fetchData();
  }, [supabase]);

  return (
    <ol className="flex flex-col gap-6">
      <TutorialStep title="Create some tables and insert some data">
        <p>
          Head over to the{" "}
          <a
            href="https://supabase.com/dashboard/project/_/editor"
            className="font-bold hover:underline text-foreground/80"
            target="_blank"
            rel="noreferrer"
          >
            Table Editor
          </a>{" "}
          for your Supabase project to create a table and insert some example
          data. If you're stuck for creativity, you can copy and paste the
          following into the{" "}
          <a
            href="https://supabase.com/dashboard/project/_/sql/new"
            className="font-bold hover:underline text-foreground/80"
            target="_blank"
            rel="noreferrer"
          >
            SQL Editor
          </a>{" "}
          and click RUN!
        </p>
        <CodeBlock code={create} />
      </TutorialStep>

      <TutorialStep title="Query Supabase data from Next.js">
        <p>
          To create a Supabase client and query data from an Async Server
          Component, create a new page.tsx file at{" "}
          <span className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-medium text-secondary-foreground border">
            /app/notes/page.tsx
          </span>{" "}
          and add the following.
        </p>
        <CodeBlock code={server} />
        <p>Alternatively, you can use a Client Component.</p>
        <CodeBlock code={client} />
      </TutorialStep>

      <TutorialStep title="Fetch data from your database">
        <p>
          Use the Supabase client to fetch data from your database.
        </p>
        <CodeBlock code={client} />
        {todos.length > 0 && (
          <>
            <p className="text-sm font-medium">Fetched data will appear below:</p>
            <pre className="bg-gray-800 text-white p-4 rounded-md text-sm overflow-auto">
              {JSON.stringify(todos, null, 2)}
            </pre>
          </>
        )}
      </TutorialStep>

      <TutorialStep title="Build in a weekend and scale to millions!">
        <p>You're ready to launch your product to the world! 🚀</p>
      </TutorialStep>
    </ol>
  );
}
