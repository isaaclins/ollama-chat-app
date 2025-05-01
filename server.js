import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_API = 'http://localhost:11434';

// Serve static frontend files
app.use(express.static(join(__dirname, 'public')));

// Parse JSON bodies with increased limit for base64 images
app.use(express.json({ limit: '50mb' }));

// Get list of available models
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_API}/api/tags`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pull a new model
app.post('/api/models/pull', async (req, res) => {
  try {
    const { modelName } = req.body;
    
    // Start the pull process
    const pullProcess = exec(`ollama pull ${modelName}`);
    
    // Stream the output back to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    pullProcess.stdout.on('data', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', data: data.toString() })}\n\n`);
    });

    pullProcess.stderr.on('data', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'error', data: data.toString() })}\n\n`);
    });

    pullProcess.on('close', (code) => {
      if (code === 0) {
        res.write(`data: ${JSON.stringify({ type: 'complete', data: 'Model pulled successfully' })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', data: 'Failed to pull model' })}\n\n`);
      }
      res.end();
    });
  } catch (error) {
    console.error('Error pulling model:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get model info
app.get('/api/models/:name', async (req, res) => {
  try {
    const modelName = req.params.name;
    const response = await fetch(`${OLLAMA_API}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching model info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a model
app.delete('/api/models/:name', async (req, res) => {
  try {
    const modelName = req.params.name;
    const { stdout, stderr } = await execAsync(`ollama rm ${modelName}`);
    res.json({ message: 'Model deleted successfully', stdout, stderr });
  } catch (error) {
    console.error('Error deleting model:', error);
    res.status(500).json({ error: error.message });
  }
});

// Custom proxy middleware for Ollama chat
app.post('/api/chat', async (req, res) => {
  try {
    if (!req.body.model) {
      return res.status(400).json({ error: 'Model name is required' });
    }

    const ollamaResponse = await fetch(`${OLLAMA_API}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: req.body.model,
        messages: req.body.messages,
        stream: true,
        options: {
          temperature: 0.7,
          top_k: 40,
          top_p: 0.9,
        }
      }),
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      throw new Error(`Ollama API error: ${ollamaResponse.statusText}. ${errorText}`);
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream the response line by line
    const responseStream = ollamaResponse.body;
    responseStream.on('data', chunk => {
      try {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            res.write(parsed.message.content);
          }
        }
      } catch (e) {
        console.error('Error parsing chunk:', e);
      }
    });

    responseStream.on('end', () => {
      res.end();
    });

    responseStream.on('error', error => {
      console.error('Stream error:', error);
      res.status(500).json({ error: 'Stream error occurred' });
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening: http://localhost:${PORT}`);
});
