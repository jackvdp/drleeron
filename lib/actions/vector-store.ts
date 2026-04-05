import { openai } from './openai';

// ─── List all vector stores ──────────────────────────────────────────────────
export async function listVectorStores() {
  const response = await openai.vectorStores.list();
  return response.data.map((store) => ({
    id: store.id,
    name: store.name,
    status: store.status,
    fileCounts: store.file_counts,
  }));
}

// ─── Create a new vector store ───────────────────────────────────────────────
export async function createVectorStore(name?: string) {
  const store = await openai.vectorStores.create({
    name: name || 'medical_knowledge_base',
  });
  return { id: store.id, name: store.name, status: store.status };
}

// ─── List files in a vector store ────────────────────────────────────────────
export async function listVectorStoreFiles(vectorStoreId: string) {
  const response = await openai.vectorStores.files.list(vectorStoreId);
  return response.data;
}

// ─── Upload files to a vector store ──────────────────────────────────────────
export async function uploadToVectorStore(formData: FormData) {
  const files = formData.getAll('files') as File[];
  const vectorStoreId = formData.get('vectorStoreId') as string;

  if (!files || files.length === 0) {
    throw new Error('No files provided');
  }
  if (!vectorStoreId) {
    throw new Error('No vector store ID provided');
  }

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const uploaded = await openai.files.create({ file, purpose: 'assistants' });
        await openai.vectorStores.files.create(vectorStoreId, { file_id: uploaded.id });
        return { fileId: uploaded.id, filename: uploaded.filename, status: 'success' as const };
      } catch (error: unknown) {
        return {
          filename: file.name,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Upload failed',
        };
      }
    })
  );

  return {
    vectorStoreId,
    totalFiles: files.length,
    successCount: results.filter((r) => r.status === 'success').length,
    errorCount: results.filter((r) => r.status === 'error').length,
    results,
  };
}

// ─── Resolve the vector store ID (env var or first available) ────────────────
export async function resolveVectorStoreId(): Promise<string | null> {
  if (process.env.VECTOR_STORE_ID) {
    return process.env.VECTOR_STORE_ID;
  }
  const stores = await listVectorStores();
  return stores.length > 0 ? stores[0].id : null;
}
