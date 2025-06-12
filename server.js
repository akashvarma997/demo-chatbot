import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { readBeautyCatalog } from './utils/excelReader.js';
import { PdfReader } from "pdfreader";
import session from 'express-session';

dotenv.config();
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(session({
  secret: 'a-secure-secret-for-your-chatbot',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(express.static('public'));
app.use(express.json());

const EXCEL_PATH = './data/beauty_products_catalog_25.xlsx';

// The / and /upload-file routes are correct and remain unchanged.
// ... (GET "/" and POST "/upload-file" routes are here) ...

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

app.post("/upload-file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  req.session.uploadedImageBase64 = null;
  req.session.uploadedPdfText = null;
  if (req.file.mimetype.startsWith("image/")) {
    req.session.uploadedImageBase64 = req.file.buffer.toString("base64");
    console.log("Image uploaded and stored in session.");
    return res.json({ success: true, message: "Image uploaded successfully." });
  }
  if (req.file.mimetype === "application/pdf") {
    try {
      console.log("Parsing PDF text...");
      const pdfText = await new Promise((resolve, reject) => {
        const reader = new PdfReader();
        let text = '';
        reader.parseBuffer(req.file.buffer, (err, item) => {
          if (err) reject(err);
          else if (!item) resolve(text);
          else if (item.text) text += item.text + " ";
        });
      });
      req.session.uploadedPdfText = pdfText;
      console.log("PDF text extracted and stored in session.");
      return res.json({ success: true, message: "PDF uploaded successfully." });
    } catch (error) {
      console.error("Error parsing PDF:", error);
      return res.status(500).json({ error: "Failed to parse PDF." });
    }
  }
  return res.status(400).json({ error: "Unsupported file type." });
});


// 👇 --- THIS IS THE NEW, FULLY CORRECTED /chat ROUTE --- 👇
app.post("/chat", async (req, res) => {
  if (!req.session.chatHistory) {
    req.session.chatHistory = [];
  }

  const question = req.body.question;
  if (!question) {
    return res.status(400).json({ error: "Missing question field." });
  }

  const catalogContext = readBeautyCatalog(EXCEL_PATH);
  req.session.chatHistory.push({ role: "user", content: question });

  let fileContext = "";
  if (req.session.uploadedPdfText) {
    fileContext = `The user has uploaded a PDF with the following content:\n---\n${req.session.uploadedPdfText}\n---`;
  }

  const systemMessage = {
    role: "system",
    content: `You are a beauty assistant. Your primary goal is to help users find skincare products from the provided catalog. Analyze images to understand user needs like skin type or tone if possible, but do not diagnose medical conditions. If asked about medical issues like acne, politely decline and recommend consulting a dermatologist. if user asks about a product make sure in the context he has earlier mentioned for what he is asking it (hair/skin etc.) and if not ask him,if user asks for a similar product but cheaper, in response if a cheaper product is available then only suggest it otherwise simply tell that no, this is the cheapest product, but a bit polietly. ${fileContext}. Use the catalog to answer product questions. Here is the product catalog: ${catalogContext}`.trim(),
  };

  // --- New, Robust Payload Construction ---
  let messagesForApi = [systemMessage];
  
  if (req.session.uploadedImageBase64) {
    // If an image exists in the session, we need to construct a proper history.
    // The image is attached to the FIRST user message in the history.
    const firstUserMessageIndex = req.session.chatHistory.findIndex(msg => msg.role === 'user');
    
    req.session.chatHistory.forEach((msg, index) => {
      if (index === firstUserMessageIndex) {
        // This is the first question from the user; attach the image to it.
        messagesForApi.push({
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${req.session.uploadedImageBase64}` } },
            { type: 'text', text: msg.content }
          ]
        });
      } else {
        // For all other messages (bot replies, subsequent user questions), add them normally.
        messagesForApi.push(msg);
      }
    });
  } else {
    // If no image, just send the text-based history.
    messagesForApi = messagesForApi.concat(req.session.chatHistory);
  }
  // --- End of New Payload Construction ---

  const payload = {
    // If an image is uploaded, use gpt-4o, otherwise use gpt-3.5-turbo.
    model: req.session.uploadedImageBase64?"gpt-4o": "gpt-3.5-turbo",
    messages: messagesForApi,
    max_tokens: 1024,
    stream: true,
  };

  try {
    const response =  await axios.post(
      "https://api.openai.com/v1/chat/completions",
      payload,
      {
        headers: { 
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        responseType: "stream",
      }
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = "";
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          res.write(line + '\n'); // Forward the event immediately
          const dataStr = line.substring(6);
          if (dataStr.trim() !== '[DONE]') {
            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
              }
            } catch (e) {
              // Ignore incomplete JSON
            }
          }
        }
      }
    });

    response.data.on('end', () => {
      // Once the stream is fully finished, save the complete response to history.
      req.session.chatHistory.push({ role: "assistant", content: fullResponse });
      res.end();
    });

  } catch (err) {
    console.error("Error from OpenAI:", err.message);
    if (!res.writableEnded) {
      res.status(500).send("Error streaming from AI service.");
    }
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});