# Dark Matter IDE

**AI-Powered Code Editor with Built-in Ollama Integration**

Dark Matter is a free, open-source code editor forked from [VS Code OSS](https://github.com/microsoft/vscode), designed to bring **local AI assistance** directly into your development workflow — no cloud APIs, no subscriptions, no data leaving your machine.

<p align="center">
  <img alt="Dark Matter IDE Welcome Screen" src="docs/images/dark-matter-welcome.png" width="900">
</p>

---

## ✨ Key Features

### 🤖 Built-in Ollama AI Chat
Dark Matter ships with a **fully integrated Ollama chat agent** — no extensions to install, no API keys to configure. Just install [Ollama](https://ollama.com), pull a model, and start chatting with AI right inside your editor.

- **Zero configuration** — works out of the box with your local Ollama instance
- **Any model** — use Gemma, Llama, Mistral, CodeLlama, DeepSeek, or any Ollama-compatible model
- **100% private** — all AI processing runs locally on your hardware
- **Workspace-aware** — the AI agent understands your project structure and files
- **Remote server support** — connect to an Ollama instance running on any machine in your network

### 🌐 Remote Ollama Server
Don't want to run AI models on your local machine? Dark Matter can connect to a **remote Ollama server** — perfect for teams sharing a powerful GPU server, or offloading inference to a dedicated machine.

To configure a remote server, simply click **"Dark Matter - Settings"** in the bottom-right of the status bar — it lets you set the server URL, select a model, and test the connection all from one place.

You can also set it manually in **Settings**:

```json
{
  "ollamaAgent.baseUrl": "http://your-server-ip:11434"
}
```

This lets you run Ollama on a beefy workstation or cloud GPU while coding on a lightweight laptop.

### 🎨 Modern Dark Theme
A sleek, sophisticated dark interface with a custom-designed look that's easy on the eyes during long coding sessions.

### 🧩 Extension Marketplace
Full access to the [Open VSX Registry](https://open-vsx.org/) — install thousands of extensions for language support, themes, debugging, and more.

### 🛠️ Everything You Love About VS Code
- IntelliSense & smart code completion
- Integrated terminal
- Built-in Git support
- Debugging for any language
- Remote development
- And much more...

---

## 🚀 Getting Started

### Prerequisites

1. **Node.js** (v18 or later)
2. **Ollama** — [Download here](https://ollama.com/download)

### Install Ollama & Pull a Model

```bash
# Install Ollama, then pull a model:
ollama pull gemma3:4b
```

### Build Dark Matter from Source

```bash
# Clone the repository
git clone https://github.com/abmina/dark-matter-ide.git
cd dark-matter-ide

# Install dependencies
npm install

# Build and launch
npm run watch
# In another terminal:
./scripts/code.sh   # Linux/macOS
.\scripts\code.bat  # Windows
```

### Using the AI Chat

1. Launch Dark Matter
2. Make sure Ollama is running (`ollama serve`)
3. Open the **Chat** panel from the sidebar
4. Select your model from the dropdown at the bottom
5. Start asking questions about your code!

---

## 🏗️ Architecture

Dark Matter extends VS Code OSS with:

| Component | Description |
|-----------|-------------|
| **Ollama Chat Agent** | Built-in chat participant that connects to your local Ollama server |
| **Language Model Provider** | Registers Ollama models as first-class language model providers |
| **Custom Welcome Page** | Branded startup experience with quick-action buttons |
| **Open VSX Marketplace** | Extension marketplace powered by the Open VSX Registry |

---

## 🔒 Privacy First

Unlike cloud-based AI coding assistants, Dark Matter's AI features run **entirely on your local machine**:

- ✅ No data sent to external servers
- ✅ No API keys or accounts required
- ✅ No usage tracking or telemetry
- ✅ Works completely offline (after model download)

---

## 🤝 Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or pull requests — all help is appreciated.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE.txt) — the same license as the upstream VS Code OSS project.

Dark Matter is a fork of [Visual Studio Code - Open Source](https://github.com/microsoft/vscode) by Microsoft.

---

## 🙏 Acknowledgments

- [Microsoft VS Code](https://github.com/microsoft/vscode) — the foundation this project is built upon
- [Ollama](https://ollama.com) — making local LLMs accessible to everyone
- [Open VSX Registry](https://open-vsx.org/) — open-source extension marketplace
