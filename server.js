import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { readBeautyCatalog } from './utils/excelReader.js';

dotenv.config();
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static('public'));
app.use(express.json());

const EXCEL_PATH = './data/beauty_products_catalog_25.xlsx';

let chatHistory = [];
let uploadedImageBase64 = null;

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Welcome</title>
      </head>
      <body>
        <h1>Welcome to the Website</h1>
        <script src="/chat-widget.js"></script>
      </body>
    </html>
  `);
});

// 🖼️ Upload image route
app.post("/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  uploadedImageBase64 = req.file.buffer.toString("base64");
  res.json({ success: true });
});

// 💬 Chat route
app.post("/chat", async (req, res) => {
  const question = req.body.question;
  if (!question) return res.status(400).json({ error: "Missing question field." });

  const catalogContext = readBeautyCatalog(EXCEL_PATH);
  chatHistory.push({ role: "user", content: question });

  const systemMessage = {
    role: "system",
    content: `
You are a beauty assistant helping users find skincare products.
Use the provided product catalog to answer.
If the user asks a follow-up, remember their past questions.

Here is the product catalog:
${catalogContext}
    `.trim(),
  };

  const fullHistory = [systemMessage, ...chatHistory];

  const payload = {
    model: "gpt-4o",
    messages: [],
    max_tokens: 300,
  };

  if (uploadedImageBase64) {
    // Use multimodal format if image uploaded
    payload.messages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${uploadedImageBase64}`,
          },
        },
        {
          type: "text",
          text: fullHistory.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n"),
        },
      ],
    });
    console.log(payload.messages, "from multimodal");
  } else {
    // Regular text-only mode
    payload.messages = fullHistory;
    console.log(payload.messages);
  }

  try {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", payload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const answer = response.data.choices[0].message.content.trim();
    chatHistory.push({ role: "assistant", content: answer });
    res.json({ answer });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to get response from OpenAI." });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
