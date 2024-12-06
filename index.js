// Importa i pacchetti necessari usando il nuovo formato di import
import express from 'express';
import bodyParser from 'body-parser';
import { google } from 'googleapis';
import fs from 'fs';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

// Configura il server Express
const app = express();
app.use(bodyParser.json());

// Crea un'istanza del client OpenAI
const openai = new OpenAI({
  apiKey: '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',
  organization: 'org-YwlkhDyXTOWQ446GiwMSQN3U',
  project: 'proj_O9CKPab0m46vGOnefe9WKic0',
});

// Configura l'autenticazione con Google
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

// ID della cartella di Google Drive
const FOLDER_ID = '1D_HKIH3MhxklntNC5GmWenbUpZuppVsb';

// Funzione per ottenere l'elenco dei file PDF dalla cartella di Google Drive
async function listPDFFilesInFolder(folderId) {
  const client = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: client });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/pdf'`,
    fields: 'files(id, name)'
  });

  return res.data.files;
}

// Funzione per scaricare un file PDF da Google Drive
async function downloadPDFFile(fileId, destPath) {
  const client = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: client });

  const dest = fs.createWriteStream(destPath);
  return new Promise((resolve, reject) => {
    drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
      (err, res) => {
        if (err) {
          console.error("Errore durante il download del file:", err);
          reject(err);
          return;
        }
        res.data
          .on('end', () => {
            resolve();
          })
          .on('error', err => {
            console.error('Errore durante lo streaming del file:', err);
            reject(err);
          })
          .pipe(dest);
      }
    );
  });
}

// Funzione per estrarre il testo da un file PDF
async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

// Endpoint per estrarre il testo da tutti i PDF nella cartella di Google Drive
app.get('/extract-pdf-text', async (req, res) => {
  try {
    const files = await listPDFFilesInFolder(FOLDER_ID);
    let allText = '';

    // Assicura che la cartella temp esista
    const tempDir = 'C:/Users/Utente/Desktop/SINDAI/temp';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    for (let file of files) {
      const filePath = `${tempDir}/${file.name}`;
      await downloadPDFFile(file.id, filePath);
      const text = await extractTextFromPDF(filePath);
      allText += `

Contenuto del file ${file.name}:
${text}`;
    }

    res.send(allText);
  } catch (error) {
    console.error("Errore durante l'estrazione del testo dai PDF:", error);
    res.status(500).send("Errore durante l'estrazione del testo dai PDF.");
  }
});

// Endpoint per fare domande sul testo estratto
app.post('/ask-question', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).send('Il campo "question" è richiesto.');
  }

  try {
    const files = await listPDFFilesInFolder(FOLDER_ID);
    let allText = '';

    // Assicura che la cartella temp esista
    const tempDir = 'C:/Users/Utente/Desktop/SINDAI/temp';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    for (let file of files) {
      const filePath = `${tempDir}/${file.name}`;
      await downloadPDFFile(file.id, filePath);
      const text = await extractTextFromPDF(filePath);
      allText += `

Contenuto del file ${file.name}:
${text}`;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `${allText}

Domanda: ${question}` }],
      max_tokens: 150,
    });

    res.json({ answer: response.choices[0].message.content.trim() });
  } catch (error) {
    console.error("Errore durante l'elaborazione della domanda:", error);
    res.status(500).send("Errore durante l'elaborazione della domanda.");
  }
});

// Avvia il server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server in esecuzione su http://localhost:${PORT}`);
});
