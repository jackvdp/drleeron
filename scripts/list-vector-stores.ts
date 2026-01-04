import OpenAI from 'openai';
import { config } from 'dotenv';

// Load from .env.local
config({ path: '.env.local' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function listVectorStores() {
  const vectorStores = await openai.vectorStores.list();
  
  console.log('\n📚 Your Vector Stores:\n');
  
  if (vectorStores.data.length === 0) {
    console.log('  No vector stores found.');
    return;
  }
  
  vectorStores.data.forEach(vs => {
    console.log(`  ID: ${vs.id}`);
    console.log(`  Name: ${vs.name}`);
    console.log(`  Status: ${vs.status}`);
    console.log(`  File Count: ${vs.file_counts?.total || 0}`);
    console.log('  ---');
  });
  
  console.log('\n💡 Add your chosen ID to .env.local:');
  console.log('   VECTOR_STORE_ID=vs_xxxxx\n');
}

listVectorStores().catch(console.error);
