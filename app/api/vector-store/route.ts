import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Create a new vector store
export async function POST(req: NextRequest) {
    try {
        const { name } = await req.json();

        const vectorStore = await openai.vectorStores.create({
            name: name || 'medical_knowledge_base',
        });

        return NextResponse.json({
            id: vectorStore.id,
            name: vectorStore.name,
            status: vectorStore.status,
        });
    } catch (error: any) {
        console.error('Error creating vector store:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create vector store' },
            { status: 500 }
        );
    }
}

// List all vector stores
export async function GET() {
    try {
        const vectorStores = await openai.vectorStores.list();

        return NextResponse.json({
            vectorStores: vectorStores.data,
        });
    } catch (error: any) {
        console.error('Error listing vector stores:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to list vector stores' },
            { status: 500 }
        );
    }
}