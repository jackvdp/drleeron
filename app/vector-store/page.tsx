'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileText, CheckCircle, Loader2, X, AlertCircle } from 'lucide-react';

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
    const [selectedVectorStore, setSelectedVectorStore] = useState<string | null>(null);
    const [files, setFiles] = useState<VectorStoreFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [newStoreName, setNewStoreName] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);

    // Load vector stores on mount
    useEffect(() => {
        loadVectorStores();
    }, []);

    // Load files when a vector store is selected
    useEffect(() => {
        if (selectedVectorStore) {
            loadFiles(selectedVectorStore);
            // Poll for file status every 3 seconds
            const interval = setInterval(() => {
                loadFiles(selectedVectorStore);
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [selectedVectorStore]);

    const loadVectorStores = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/vector-store');
            const data = await response.json();
            setVectorStores(data.vectorStores || []);
        } catch (error) {
            console.error('Error loading vector stores:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadFiles = async (vectorStoreId: string) => {
        try {
            const response = await fetch(`/api/vector-store/${vectorStoreId}/files`);
            const data = await response.json();
            setFiles(data.files || []);
        } catch (error) {
            console.error('Error loading files:', error);
        }
    };

    const createVectorStore = async () => {
        if (!newStoreName.trim()) return;

        try {
            setCreating(true);
            const response = await fetch('/api/vector-store', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newStoreName }),
            });

            const data = await response.json();
            setVectorStores([...vectorStores, data]);
            setSelectedVectorStore(data.id);
            setNewStoreName('');
        } catch (error) {
            console.error('Error creating vector store:', error);
        } finally {
            setCreating(false);
        }
    };

    const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const filesArray = Array.from(event.target.files);
            setSelectedFiles(filesArray);
            setUploadResults(null);
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
    };

    const handleFileUpload = async () => {
        if (selectedFiles.length === 0 || !selectedVectorStore) return;

        const formData = new FormData();
        selectedFiles.forEach((file) => {
            formData.append('files', file);
        });
        formData.append('vectorStoreId', selectedVectorStore);

        try {
            setUploading(true);
            setUploadResults(null);
            const response = await fetch('/api/vector-store/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            setUploadResults(data.results);

            if (response.ok) {
                await loadFiles(selectedVectorStore);
                // Clear selected files after successful upload
                if (data.errorCount === 0) {
                    setSelectedFiles([]);
                }
            }
        } catch (error) {
            console.error('Error uploading files:', error);
        } finally {
            setUploading(false);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Vector Store Manager</h1>
                <p className="text-muted-foreground">
                    Create vector stores and upload documents for AI-powered search
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column - Vector Stores */}
                <Card>
                    <CardHeader>
                        <CardTitle>Vector Stores</CardTitle>
                        <CardDescription>Create and manage your knowledge bases</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {/* Create new vector store */}
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Enter store name..."
                                    value={newStoreName}
                                    onChange={(e) => setNewStoreName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && createVectorStore()}
                                />
                                <Button onClick={createVectorStore} disabled={creating || !newStoreName.trim()}>
                                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                                </Button>
                            </div>

                            {/* List of vector stores */}
                            <ScrollArea className="h-[300px] rounded-md border p-4">
                                {loading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    </div>
                                ) : vectorStores.length === 0 ? (
                                    <div className="text-center text-muted-foreground py-8">
                                        No vector stores yet. Create one to get started!
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {vectorStores.map((store) => (
                                            <div
                                                key={store.id}
                                                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                                    selectedVectorStore === store.id
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'hover:bg-muted'
                                                }`}
                                                onClick={() => setSelectedVectorStore(store.id)}
                                            >
                                                <div className="font-medium">{store.name}</div>
                                                <div className="text-sm opacity-70 font-mono text-xs">{store.id}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </CardContent>
                </Card>

                {/* Right Column - File Upload */}
                <Card>
                    <CardHeader>
                        <CardTitle>Upload Documents</CardTitle>
                        <CardDescription>
                            {selectedVectorStore
                                ? 'Add multiple files to the selected vector store'
                                : 'Select a vector store first'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {/* File selection */}
                            <div>
                                <Input
                                    type="file"
                                    onChange={handleFileSelection}
                                    disabled={!selectedVectorStore || uploading}
                                    accept=".pdf,.txt,.md,.doc,.docx"
                                    multiple
                                    className="cursor-pointer"
                                />
                            </div>

                            {/* Selected files preview */}
                            {selectedFiles.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium">
                                            Selected files ({selectedFiles.length})
                                        </p>
                                        <Button
                                            onClick={handleFileUpload}
                                            disabled={uploading}
                                            size="sm"
                                        >
                                            {uploading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    Uploading...
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="w-4 h-4 mr-2" />
                                                    Upload All
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                    <ScrollArea className="h-[150px] rounded-md border p-2">
                                        <div className="space-y-1">
                                            {selectedFiles.map((file, index) => (
                                                <div
                                                    key={index}
                                                    className="flex items-center gap-2 p-2 rounded hover:bg-muted text-sm"
                                                >
                                                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                    <div className="flex-1 truncate">
                                                        <div className="truncate">{file.name}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {formatFileSize(file.size)}
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeFile(index)}
                                                        disabled={uploading}
                                                        className="flex-shrink-0"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>
                            )}

                            {/* Upload results */}
                            {uploadResults && (
                                <div className="rounded-md border p-3 space-y-2">
                                    <p className="text-sm font-medium">Upload Results</p>
                                    <div className="space-y-1">
                                        {uploadResults.map((result, index) => (
                                            <div
                                                key={index}
                                                className={`flex items-center gap-2 text-sm p-2 rounded ${
                                                    result.status === 'success'
                                                        ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                                                        : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                                                }`}
                                            >
                                                {result.status === 'success' ? (
                                                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                                ) : (
                                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                                )}
                                                <div className="flex-1 truncate">
                                                    <div className="truncate">{result.filename}</div>
                                                    {result.error && (
                                                        <div className="text-xs opacity-80">{result.error}</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Uploaded files list */}
                            <div>
                                <p className="text-sm font-medium mb-2">Vector Store Files</p>
                                <ScrollArea className="h-[200px] rounded-md border p-4">
                                    {!selectedVectorStore ? (
                                        <div className="text-center text-muted-foreground py-8">
                                            Select a vector store to view files
                                        </div>
                                    ) : files.length === 0 ? (
                                        <div className="text-center text-muted-foreground py-8">
                                            <Upload className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                            <p>No files uploaded yet</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {files.map((file) => (
                                                <div
                                                    key={file.id}
                                                    className="p-3 rounded-lg border flex items-center gap-3"
                                                >
                                                    <FileText className="w-5 h-5 text-muted-foreground" />
                                                    <div className="flex-1">
                                                        <div className="font-mono text-xs">{file.id}</div>
                                                        <div className="text-xs text-muted-foreground capitalize">
                                                            Status: {file.status}
                                                        </div>
                                                    </div>
                                                    {file.status === 'completed' && (
                                                        <CheckCircle className="w-5 h-5 text-green-500" />
                                                    )}
                                                    {file.status === 'in_progress' && (
                                                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
