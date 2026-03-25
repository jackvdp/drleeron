import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function uploadDocuments() {
  // Put your medical documents in a 'documents' folder
  const documentsFolder = path.join(process.cwd(), 'documents');
  
  if (!fs.existsSync(documentsFolder)) {
    console.error('❌ Create a "documents" folder in your project root and add your PDF/text files there');
    return;
  }

  const files = fs.readdirSync(documentsFolder);
  const uploadedFileIds: string[] = [];

  console.log(`📁 Found ${files.length} files to upload\n`);

  // Upload each file
  for (const filename of files) {
    const filePath = path.join(documentsFolder, filename);
    
    // Skip if not a file
    if (!fs.statSync(filePath).isFile()) continue;
    
    console.log(`⬆️  Uploading ${filename}...`);
    
    try {
      const file = await openai.files.create({
        file: fs.createReadStream(filePath),
        purpose: 'assistants',
      });
      
      uploadedFileIds.push(file.id);
      console.log(`✅ Uploaded: ${filename} (${file.id})\n`);
    } catch (error) {
      console.error(`❌ Failed to upload ${filename}:`, error);
    }
  }

  if (uploadedFileIds.length === 0) {
    console.error('❌ No files were uploaded');
    return;
  }

  console.log('\n📦 All files uploaded! File IDs:');
  uploadedFileIds.forEach(id => console.log(`   - ${id}`));
  
  console.log('\n🔄 Now creating vector store...');

  // Create a vector store with all files
  const vectorStore = await openai.vectorStores.create({
    name: 'Dr. Leeron Medical Documents',
    file_ids: uploadedFileIds,
  });

  console.log(`✅ Vector store created: ${vectorStore.id}`);
  console.log('\n📝 Add this to your .env.local file:');
  console.log(`OPENAI_VECTOR_STORE_ID=${vectorStore.id}`);
  
  return { vectorStoreId: vectorStore.id, fileIds: uploadedFileIds };
}

uploadDocuments().catch(console.error);
