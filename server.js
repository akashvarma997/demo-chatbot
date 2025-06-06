import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import { readBeautyCatalog } from "./utils/excelReader.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();




const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());

const EXCEL_PATH = "./data/beauty_products_catalog_25.xlsx";

const chatHistory = [];

app.post("/chat", async (req, res) => {
  const question = req.body.question;
  if (!question) {
    return res.status(400).json({ error: "Missing question field." });
  }

  // Load product catalog
  const catalogContext = readBeautyCatalog(EXCEL_PATH);

  // Add new user question to chat history
  chatHistory.push({ role: "user", content: question });

  // Prepare chat messages: start with a system prompt
  const messages = [
    {
      role: "system",
      content: `
You are a beauty assistant helping users find skincare products.
Use the provided product catalog to answer.
If the user asks a follow-up, remember their past questions.

Here is the product catalog:
${catalogContext}
    `.trim(),
    },
    ...chatHistory, // full back-and-forth history
  ];

  console.log("Sending messages to OpenAI:", messages);

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages,
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
          "Content-Type": "application/json",
        },
      },
    );

    const answer = response.data.choices[0].message.content.trim();

    // Save assistant's reply in memory too
    chatHistory.push({ role: "assistant", content: answer });

    res.json({ answer });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to get response from OpenAI." });
  }
});

// Serve the static HTML
app.get("/", (req, res) => {
  res.send(`
    <html>
    <head><title>Home</title></head>
    <body>
      <h1>Welcome to the Website</h1>
      <script src="/chat-widget.js"></script>
    </body>
    </html>
  `);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
