# Ollama Chat App

A lightweight local web interface for chatting with Large Language Models (LLMs) that run **entirely on your machine** via [Ollama](https://ollama.com/). The default model is the multi-modal `llava-llama3`, but you can pull and switch to any other model exposed by Ollama.

## ✨ Features

• Real-time streaming chat with any Ollama model  
• Image upload **and** paste support (works with multi-modal models such as `llava-llama3`)  
• Built-in _Model Manager_ – list, pull, delete and switch models from the UI  
• Cancel in-flight requests  
• Everything stays local – no data leaves your machine

## 📋 Prerequisites

1. **Node.js** ≥ 18
2. **npm** (comes with Node.js)
3. **Ollama** installed and available on your PATH (`ollama serve` should work)

## 🚀 Quick Start

The repository ships with a convenience script that spins everything up for you.

```bash
./start.sh
```

The script will:

1. Run `ollama run llava-llama3` in the background (downloads the model on first run).
2. Wait for the Ollama REST API (`http://localhost:11434`) to become ready.
3. Launch the Node/Express server on port **3000**.

Open <http://localhost:3000> in your browser and start chatting!

### Manual start

Already have Ollama running? Start the server directly:

```bash
ollama serve &   # if not already running
npm start        # installs dependencies if needed and starts the server
```

Set the environment variable `PORT` to override the default port (3000).

## 🗂️ Project Structure

```
ollama-chat-app/
├── public/           # Static front-end assets
│   ├── index.html    # Main HTML page
│   ├── app.js        # Chat UI logic
│   ├── models.js     # Model Manager modal
│   └── style.css     # Styles
├── server.js         # Express API ↔️ Ollama proxy
├── start.sh          # Convenience bootstrap script
└── package.json      # npm metadata & scripts
```

## 🔧 npm Scripts

• `npm start` – install dependencies (if missing) and start the app  
• `npm run dev` – start with hot-reload via **nodemon**

## 📑 REST API Endpoints (served by `server.js`)

| Method | Path              | Description                             |
| ------ | ----------------- | --------------------------------------- |
| GET    | /api/models       | List locally-available models           |
| POST   | /api/models/pull  | Pull a model by name (streams progress) |
| GET    | /api/models/:name | Fetch detailed model info               |
| DELETE | /api/models/:name | Delete a local model                    |
| POST   | /api/chat         | Proxy to Ollama chat (streaming)        |

## ⚙️ Configuration

| Variable | Default | Description                 |
| -------- | ------- | --------------------------- |
| `PORT`   | 3000    | Port for the Express server |

If your Ollama instance is not running on `localhost:11434`, change the `OLLAMA_API` constant in `server.js`.

## 🛠️ Development

```bash
git clone https://github.com/isaaclins/ollama-chat-app.git
cd ollama-chat-app
npm install
npm run dev
```

The dev server uses **nodemon** for automatic reload on file changes.

## 📄 License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.
