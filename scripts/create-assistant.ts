import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function createAssistant() {
  // Get vector store ID from environment
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
  
  if (!vectorStoreId) {
    console.error('❌ Please run upload-documents.ts first and add OPENAI_VECTOR_STORE_ID to .env.local');
    return;
  }

  console.log('🤖 Creating Dr. Leeron assistant...\n');

  const assistant = await openai.beta.assistants.create({
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
    tools: [
      { type: 'file_search' }
    ],
    tool_resources: {
      file_search: {
        vector_store_ids: [vectorStoreId]
      }
    },
    temperature: 0.7,
  });

  console.log(`✅ Assistant created successfully!`);
  console.log(`   ID: ${assistant.id}`);
  console.log(`   Name: ${assistant.name}`);
  console.log(`   Model: ${assistant.model}`);
  console.log(`   Tools: ${assistant.tools.map(t => t.type).join(', ')}`);
  
  console.log('\n📝 Add this to your .env.local file:');
  console.log(`OPENAI_ASSISTANT_ID=${assistant.id}`);
  
  return assistant;
}

createAssistant().catch(console.error);
