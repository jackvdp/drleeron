import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const files = formData.getAll('files') as File[];
        const vectorStoreId = formData.get('vectorStoreId') as string;

        if (!files || files.length === 0) {
            return NextResponse.json(
                { error: 'No files provided' },
                { status: 400 }
            );
        }

        if (!vectorStoreId) {
            return NextResponse.json(
                { error: 'No vector store ID provided' },
                { status: 400 }
            );
        }

        // Upload all files and add them to the vector store
        const uploadResults = await Promise.all(
            files.map(async (file) => {
                try {
                    // Upload file to OpenAI
                    const uploadedFile = await openai.files.create({
                        file: file,
                        purpose: 'assistants',
                    });

                    // Add file to vector store
                    await openai.vectorStores.files.create(vectorStoreId, {
                        file_id: uploadedFile.id,
                    });

                    return {
                        fileId: uploadedFile.id,
                        filename: uploadedFile.filename,
                        status: 'success',
                    };
                } catch (error: any) {
                    return {
                        filename: file.name,
                        status: 'error',
                        error: error.message,
                    };
                }
            })
        );

        const successCount = uploadResults.filter((r) => r.status === 'success').length;
        const errorCount = uploadResults.filter((r) => r.status === 'error').length;

        return NextResponse.json({
            vectorStoreId: vectorStoreId,
            totalFiles: files.length,
            successCount,
            errorCount,
            results: uploadResults,
        });
    } catch (error: any) {
        console.error('Error uploading files:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to upload files' },
            { status: 500 }
        );
    }
}