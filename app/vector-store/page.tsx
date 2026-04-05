'use client';

import { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, Loader2, X, AlertCircle, Database, Plus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface VectorStore {
  id: string;
  name: string;
  status: string;
}

interface VectorStoreFile {
  id: string;
  status: string;
  vector_store_id: string;
}

interface UploadResult {
  fileId?: string;
  filename: string;
  status: 'success' | 'error';
  error?: string;
}

export default function VectorStorePage() {
  const [vectorStores, setVectorStores] = useState<VectorStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [files, setFiles] = useState<VectorStoreFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newStoreName, setNewStoreName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);

  useEffect(() => {
    loadVectorStores();
  }, []);

  useEffect(() => {
    if (selectedStore) {
      loadFiles(selectedStore);
      const interval = setInterval(() => loadFiles(selectedStore), 5000);
      return () => clearInterval(interval);
    }
  }, [selectedStore]);

  const loadVectorStores = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/vector-store');
      const data = await response.json();
      const stores = data.vectorStores || [];
      setVectorStores(stores);
      if (stores.length > 0 && !selectedStore) {
        setSelectedStore(stores[0].id);
      }
    } catch (error) {
      console.error('Error loading vector stores:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async (id: string) => {
    try {
      const response = await fetch(`/api/vector-store/${id}/files`);
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  const handleCreate = async () => {
    if (!newStoreName.trim()) return;
    try {
      setCreating(true);
      const response = await fetch('/api/vector-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStoreName }),
      });
      const data = await response.json();
      setVectorStores((prev) => [...prev, data]);
      setSelectedStore(data.id);
      setNewStoreName('');
    } catch (error) {
      console.error('Error creating vector store:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(Array.from(event.target.files));
      setUploadResults(null);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !selectedStore) return;
    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append('files', file));
    formData.append('vectorStoreId', selectedStore);

    try {
      setUploading(true);
      setUploadResults(null);
      const response = await fetch('/api/vector-store/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setUploadResults(data.results);
      if (response.ok && data.errorCount === 0) {
        setSelectedFiles([]);
      }
      await loadFiles(selectedStore);
    } catch (error) {
      console.error('Error uploading files:', error);
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const selectedStoreName = vectorStores.find((s) => s.id === selectedStore)?.name;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(
              ellipse at 50% 50%,
              rgba(50, 50, 80, 1) 0%,
              rgba(35, 35, 65, 1) 35%,
              rgba(25, 25, 50, 1) 60%,
              rgba(18, 18, 40, 1) 80%,
              rgba(12, 12, 30, 1) 100%
            )
          `,
        }}
      />

      <div className="relative z-10 flex flex-col min-h-screen max-w-5xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/"
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white/80 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-light text-white/90 tracking-wide">Knowledge Base</h1>
            <p className="text-white/40 text-sm mt-1">Manage vector stores and upload exam documents</p>
          </div>
        </div>

        <div className="grid md:grid-cols-[300px_1fr] gap-6 flex-1">
          {/* Sidebar — Vector Stores */}
          <div className="space-y-4">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
              <p className="text-white/60 text-xs font-medium mb-3 flex items-center gap-2">
                <Database className="w-3.5 h-3.5" />
                Vector Stores
              </p>

              {/* Create */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="New store name..."
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !newStoreName.trim()}
                  className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Store list */}
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                  </div>
                ) : vectorStores.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-8">No stores yet</p>
                ) : (
                  vectorStores.map((store) => (
                    <button
                      key={store.id}
                      onClick={() => setSelectedStore(store.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm ${
                        selectedStore === store.id
                          ? 'bg-purple-500/20 border border-purple-500/30 text-purple-200'
                          : 'text-white/70 hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="font-medium truncate">{store.name}</div>
                      <div className="text-xs text-white/30 font-mono mt-0.5 truncate">{store.id}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Main — Files & Upload */}
          <div className="space-y-4">
            {!selectedStore ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                <Database className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/40">Select or create a vector store to get started</p>
              </div>
            ) : (
              <>
                {/* Upload area */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
                  <p className="text-white/60 text-xs font-medium mb-3 flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" />
                    Upload to &ldquo;{selectedStoreName}&rdquo;
                  </p>

                  <label className="block cursor-pointer">
                    <div className="border-2 border-dashed border-white/10 hover:border-white/20 rounded-xl p-6 text-center transition-all hover:bg-white/[0.02]">
                      <Upload className="w-8 h-8 text-white/20 mx-auto mb-2" />
                      <p className="text-white/50 text-sm">Click to select files or drag &amp; drop</p>
                      <p className="text-white/30 text-xs mt-1">PDF, TXT, MD, DOC, DOCX</p>
                    </div>
                    <input
                      type="file"
                      onChange={handleFileSelection}
                      disabled={uploading}
                      accept=".pdf,.txt,.md,.doc,.docx"
                      multiple
                      className="hidden"
                    />
                  </label>

                  {/* Selected files */}
                  {selectedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-white/50 text-xs">{selectedFiles.length} file(s) selected</p>
                        <button
                          onClick={handleUpload}
                          disabled={uploading}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm hover:bg-purple-500/30 transition-all disabled:opacity-40"
                        >
                          {uploading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              Upload All
                            </>
                          )}
                        </button>
                      </div>

                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {selectedFiles.map((file, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] text-sm"
                          >
                            <FileText className="w-4 h-4 text-white/30 flex-shrink-0" />
                            <span className="text-white/70 truncate flex-1">{file.name}</span>
                            <span className="text-white/30 text-xs flex-shrink-0">{formatFileSize(file.size)}</span>
                            <button
                              onClick={() => setSelectedFiles((prev) => prev.filter((_, j) => j !== i))}
                              disabled={uploading}
                              className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upload results */}
                  {uploadResults && (
                    <div className="mt-4 space-y-1">
                      {uploadResults.map((result, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                            result.status === 'success'
                              ? 'bg-green-500/10 text-green-300'
                              : 'bg-red-500/10 text-red-300'
                          }`}
                        >
                          {result.status === 'success' ? (
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          )}
                          <span className="truncate">{result.filename}</span>
                          {result.error && (
                            <span className="text-xs opacity-70 ml-auto flex-shrink-0">{result.error}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Files in store */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
                  <p className="text-white/60 text-xs font-medium mb-3 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    Files in Store ({files.length})
                  </p>

                  {files.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-10 h-10 text-white/10 mx-auto mb-2" />
                      <p className="text-white/30 text-sm">No files uploaded yet</p>
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-[400px] overflow-y-auto">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02]"
                        >
                          <FileText className="w-4 h-4 text-white/30 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-white/60 text-xs font-mono truncate">{file.id}</div>
                          </div>
                          {file.status === 'completed' ? (
                            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                          ) : file.status === 'in_progress' ? (
                            <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                          ) : (
                            <span className="text-white/30 text-xs capitalize flex-shrink-0">{file.status}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
