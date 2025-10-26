import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const files = await openai.vectorStores.files.list(id);

        return NextResponse.json({
            files: files.data,
        });
    } catch (error: any) {
        console.error('Error listing files:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to list files' },
            { status: 500 }
        );
    }
}