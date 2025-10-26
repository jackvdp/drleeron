import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default assistant configuration
export const DEFAULT_ASSISTANT_CONFIG = {
  name: 'Dr. Leeron',
  instructions: `You are Dr. Leeron, an experienced medical student tutor with access to comprehensive medical textbooks and resources.

Your teaching methodology:
1. **Socratic Questioning**: Guide students to discover answers through thoughtful questions
2. **Evidence-Based**: Reference medical literature and guidelines from uploaded documents
3. **Clinical Context**: Connect theoretical knowledge to real-world clinical scenarios
4. **Active Learning**: Encourage problem-solving and critical thinking
5. **Supportive Feedback**: Correct misconceptions gently with clear explanations

Teaching approach:
- Break down complex topics into digestible concepts
- Use analogies and mnemonics when helpful
- Provide case-based examples to illustrate key points
- Ask follow-up questions to assess understanding
- Reference specific sections from medical textbooks when relevant
- Encourage students to explain concepts back to reinforce learning

When students ask questions:
1. First, search the uploaded medical documents for relevant information
2. Provide accurate, evidence-based answers
3. Cite specific sources when possible
4. Ask clarifying questions if needed
5. Follow up to ensure comprehension

Always maintain medical accuracy, professionalism, and a supportive learning environment.`,
  model: 'gpt-4-turbo-preview',
  tools: [{ type: 'file_search' }], // Enable file search for uploaded documents
  ...(process.env.OPENAI_VECTOR_STORE_ID && {
    tool_resources: {
      file_search: {
        vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID]
      }
    }
  })
};

/**
 * Get or create an assistant
 */
export async function getOrCreateAssistant(assistantId?: string) {
  // If assistant ID is provided, use it
  if (assistantId) {
    try {
      const assistant = await openai.beta.assistants.retrieve(assistantId);
      return assistant;
    } catch (error) {
      console.error('Failed to retrieve assistant:', error);
      // Fall through to create new one
    }
  }

  // Check environment variable
  const envAssistantId = process.env.OPENAI_ASSISTANT_ID;
  if (envAssistantId) {
    try {
      const assistant = await openai.beta.assistants.retrieve(envAssistantId);
      return assistant;
    } catch (error) {
      console.error('Failed to retrieve assistant from env:', error);
      // Fall through to create new one
    }
  }

  // Create new assistant
  const assistant = await openai.beta.assistants.create(DEFAULT_ASSISTANT_CONFIG);
  console.log('Created new assistant:', assistant.id);
  return assistant;
}

/**
 * Create a new thread
 */
export async function createThread() {
  const thread = await openai.beta.threads.create();
  return thread;
}

/**
 * Add a message to a thread
 */
export async function addMessage(threadId: string, content: string, role: 'user' | 'assistant' = 'user') {
  const message = await openai.beta.threads.messages.create(threadId, {
    role,
    content,
  });
  return message;
}

/**
 * List messages in a thread
 */
export async function listMessages(threadId: string, limit = 20) {
  const messages = await openai.beta.threads.messages.list(threadId, {
    limit,
    order: 'asc',
  });
  return messages.data;
}

/**
 * Delete a thread
 */
export async function deleteThread(threadId: string) {
  const response = await openai.beta.threads.del(threadId);
  return response;
}

/**
 * Update assistant instructions
 */
export async function updateAssistant(assistantId: string, instructions: string) {
  const assistant = await openai.beta.assistants.update(assistantId, {
    instructions,
  });
  return assistant;
}

/**
 * Create a run and stream the response
 */
export async function createRunStream(threadId: string, assistantId: string) {
  const stream = await openai.beta.threads.runs.stream(threadId, {
    assistant_id: assistantId,
  });
  return stream;
}
