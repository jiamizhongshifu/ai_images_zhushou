import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from 'https://deno.land/x/openai@v4.52.7/mod.ts'; // Use Deno compatible OpenAI lib
import { corsHeaders } from '../_shared/cors.ts' // Assuming you have CORS setup
import { extractImageUrl, handleApiError } from '../_shared/utils.ts' // Re-added .ts extension

// Type for the task data expected from the database
interface ImageTask {
  id: number;
  task_id: string;
  user_id: string;
  status: string;
  prompt: string;
  image_base64?: string | null;
  style?: string | null;
  // Add other fields if needed by the API call
}

// Define MessageContent type based on OpenAI spec
type MessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };


// --- Configuration --- M
const MAX_TASKS_PER_RUN = 5; // Process up to 5 tasks per invocation
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL');
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY'); // Use the new secret name
const OPENAI_TIMEOUT = 180000; // 3 minutes timeout for the API call

console.log("Edge function starting up...");
console.log(`Supabase URL: ${SUPABASE_URL ? 'Set' : 'Not Set'}`);
console.log(`Tuzi Base URL: ${OPENAI_BASE_URL ? 'Set' : 'Not Set'}`);
console.log(`Tuzi Model: ${OPENAI_MODEL ? 'Set' : 'Not Set'}`);
// Avoid logging keys directly in production
// console.log(`Tuzi API Key: ${OPENAI_API_KEY ? 'Set' : 'Not Set'}`);
// console.log(`Supabase Service Key: ${SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not Set'}`);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY || !OPENAI_BASE_URL || !OPENAI_MODEL) {
    console.error("FATAL: Missing required environment variables for the Edge Function.");
    // In a real scenario, you might want to prevent the function from running further
}

serve(async (req) => {
  // Optional: Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log("Received request to process image tasks...");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY || !OPENAI_BASE_URL || !OPENAI_MODEL) {
      return new Response(JSON.stringify({ error: "Edge function configuration error: Missing environment variables." }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
  }

  // Initialize Supabase Admin Client
  const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
     auth: { persistSession: false } // Don't persist session for server-side
  });

  // Initialize OpenAI Client for Tuzi
  const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL,
      timeout: OPENAI_TIMEOUT, // Set timeout
  });

  let tasksProcessed = 0;
  let tasksFailed = 0;
  let tasksCompleted = 0;

  try {
    // 1. Fetch pending tasks
    console.log(`Fetching up to ${MAX_TASKS_PER_RUN} pending tasks...`);
    const { data: tasks, error: fetchError } = await supabaseAdmin
      .from('image_tasks')
      .select('id, task_id, user_id, status, prompt, image_base64, style') // Select only needed fields
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_TASKS_PER_RUN);

    if (fetchError) {
      console.error('Error fetching pending tasks:', fetchError);
      throw new Error(`Database error fetching tasks: ${fetchError.message}`);
    }

    if (!tasks || tasks.length === 0) {
      console.log('No pending tasks found.');
      return new Response(JSON.stringify({ message: 'No pending tasks found.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${tasks.length} pending tasks. Processing...`);

    // 2. Process each task
    for (const task of tasks as ImageTask[]) {
      console.log(`Processing task ID: ${task.task_id}...`);
      tasksProcessed++;
      let imageUrl: string | null = null;
      let errorMessage: string | null = null;
      let finalStatus: 'completed' | 'failed' = 'failed'; // Default to failed

      try {
        // 2a. Update status to 'processing'
        const { error: updateProcessingError } = await supabaseAdmin
          .from('image_tasks')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', task.id) // Use primary key for update
          .eq('status', 'pending'); // Ensure we only update if still pending (atomic-like)

        if (updateProcessingError) {
          console.error(`Error updating task ${task.task_id} to processing:`, updateProcessingError);
          // Don't throw, just log and skip if update failed (another process might have grabbed it)
          tasksFailed++;
          continue;
        }
        console.log(`Task ${task.task_id} status updated to 'processing'.`);

        // 2b. Prepare API call messages
        const messages: { role: 'user'; content: MessageContent[] }[] = [{
            role: "user",
            content: [{ type: "text", text: `${task.prompt}. 请直接生成一张与描述相符的图片，不要包含任何文字说明，只返回一个图片链接。` }] // Add instruction
        }];

        if (task.image_base64) {
            // Assume image_base64 already includes the 'data:image/...' prefix from the /create endpoint
            messages[0].content.unshift({
                type: "image_url",
                image_url: { url: task.image_base64 } // Pass the base64 data URL
            });
            console.log(`Task ${task.task_id} includes an image.`);
        }

        // 2c. Call Tuzi API via OpenAI client
        console.log(`Task ${task.task_id}: Calling Tuzi API...`);
        const completion = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: messages as any, // Cast needed due to library specifics sometimes
            max_tokens: 4096, // Adjust if needed
            stream: false, // We need the full response
        });
         console.log(`Task ${task.task_id}: API call completed.`);

        // 2d. Process response
        const content = completion.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('API returned empty content.');
        }

        imageUrl = extractImageUrl(content);

        if (!imageUrl) {
            // If API returned text but no valid URL, consider it a failure from the API
            console.error(`Task ${task.task_id}: Failed to extract valid image URL from API response:`, content.substring(0, 200) + '...');
            errorMessage = "无法从API响应中提取有效图片URL或API返回错误文本。"; // User-friendly message
            // Consider logging the full 'content' here for debugging if needed
            throw new Error(errorMessage);
        }

        console.log(`Task ${task.task_id}: Successfully generated image URL: ${imageUrl}`);
        finalStatus = 'completed';
        tasksCompleted++;

      } catch (processingError: any) {
        console.error(`Error processing task ${task.task_id}:`, processingError);
        tasksFailed++;
        const handledError = handleApiError(processingError);
        errorMessage = handledError.message; // Get user-friendly message
        finalStatus = 'failed';
        // **Credit Refund Consideration:**
        // Avoid refunding credits here automatically unless you have very specific error handling
        // from Tuzi confirming non-consumption (like immediate auth/quota errors caught by handleApiError).
        // A general processing error or timeout might still mean Tuzi consumed resources.
        // Log the specific error type for potential manual review or more advanced refund logic.
        console.log(`Task ${task.task_id} failed with error type: ${handledError.errorType}`);
      }

      // 2e. Update final task status in DB
      console.log(`Task ${task.task_id}: Updating final status to ${finalStatus}.`);
      const updatePayload: any = {
        status: finalStatus,
        updated_at: new Date().toISOString(),
        error_message: errorMessage,
        result_url: imageUrl,
      };
      if (finalStatus === 'completed') {
        updatePayload.completed_at = new Date().toISOString();
      }

      const { error: finalUpdateError } = await supabaseAdmin
        .from('image_tasks')
        .update(updatePayload)
        .eq('id', task.id); // Use primary key

      if (finalUpdateError) {
        console.error(`Error updating final status for task ${task.task_id}:`, finalUpdateError);
        // Log this error, but don't necessarily count it as another task failure
      } else {
         console.log(`Task ${task.task_id}: Final status update successful.`);
      }
    } // End of task loop

    // 3. Return summary response
    const summary = `Processed ${tasksProcessed} tasks: ${tasksCompleted} completed, ${tasksFailed} failed.`;
    console.log(summary);
    return new Response(JSON.stringify({ message: summary }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in Edge Function main execution:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}) 