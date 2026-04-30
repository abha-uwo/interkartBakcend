const fs = require('fs');
const path = require('path');

class SimpleRAG {
    constructor(openai) {
        this.openai = openai;
        this.chunks = []; // Store { text: string, embedding: number[] }
        this.kbPath = path.join(__dirname, 'knowledge_base');
    }

    // Initialize and load knowledge base
    async init() {
        if (!fs.existsSync(this.kbPath)) {
            fs.mkdirSync(this.kbPath);
            console.log(`[RAG] Created knowledge_base directory at ${this.kbPath}`);
        }

        const files = fs.readdirSync(this.kbPath).filter(f => f.endsWith('.txt'));
        if (files.length === 0) {
            console.log('[RAG] No .txt files found in knowledge_base directory. Add some to enable RAG!');
            return;
        }

        console.log(`[RAG] Found ${files.length} files in knowledge_base. Processing...`);
        
        let allText = '';
        for (const file of files) {
            const content = fs.readFileSync(path.join(this.kbPath, file), 'utf-8');
            allText += content + '\n\n';
        }

        // Simple chunking (split by double newlines or chunks of ~500 chars)
        const rawChunks = this.chunkText(allText, 500);
        console.log(`[RAG] Created ${rawChunks.length} text chunks. Generating embeddings...`);

        // Generate embeddings for all chunks
        for (const chunk of rawChunks) {
            if (chunk.trim().length === 0) continue;
            try {
                const embedding = await this.getEmbedding(chunk);
                this.chunks.push({ text: chunk, embedding });
            } catch (err) {
                console.error("[RAG] Error generating embedding for chunk:", err.message);
            }
        }
        
        console.log(`[RAG] Initialized successfully with ${this.chunks.length} vectorized chunks.`);
    }

    chunkText(text, maxChars) {
        const paragraphs = text.split('\n\n');
        let chunks = [];
        let currentChunk = '';

        for (const p of paragraphs) {
            if ((currentChunk.length + p.length) < maxChars) {
                currentChunk += p + '\n\n';
            } else {
                if (currentChunk.trim()) chunks.push(currentChunk.trim());
                currentChunk = p + '\n\n';
            }
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        return chunks;
    }

    async getEmbedding(text) {
        const response = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text
        });
        return response.data[0].embedding;
    }

    cosineSimilarity(vecA, vecB) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    async search(query, topK = 3) {
        if (this.chunks.length === 0) return ''; // No data

        try {
            const queryEmbedding = await this.getEmbedding(query);
            
            // Calculate similarity for all chunks
            const results = this.chunks.map(chunk => ({
                text: chunk.text,
                similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
            }));

            // Sort by highest similarity
            results.sort((a, b) => b.similarity - a.similarity);

            // Return top K chunks combined
            return results.slice(0, topK).map(r => r.text).join('\n\n---\n\n');
        } catch (error) {
            console.error("[RAG] Search error:", error.message);
            return '';
        }
    }
}

module.exports = SimpleRAG;
