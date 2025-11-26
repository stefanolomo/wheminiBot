// Carga variables de entorno desde el archivo .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os'); // <--- Para obtener carpetas temporales
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const ffmpeg = require('fluent-ffmpeg'); // <--- NUEVA DEPENDENCIA

// --- MARCA DE TIEMPO DE INICIO ---
const TIMESTAMP_INICIO = Math.floor(Date.now() / 1000);

// Validación de API Key
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("❌ ERROR: No se encontró la variable GEMINI_API_KEY en el archivo .env");
    process.exit(1);
}

// --- CARGA DE INSTRUCCIONES DESDE ARCHIVO ---
const RUTA_INSTRUCCIONES = path.join(__dirname, 'instructions.txt');
let INSTRUCCIONES_BOT = "";

try {
    INSTRUCCIONES_BOT = fs.readFileSync(RUTA_INSTRUCCIONES, 'utf8');
    console.log("✅ Instrucciones cargadas exitosamente desde instructions.txt");
} catch (error) {
    console.error(`❌ ERROR CRÍTICO: No se pudo leer el archivo 'instructions.txt'.\nDetalle: ${error.message}`);
    process.exit(1);
}

// --- VARIABLES GLOBALES DE ESTADO ---
let nombreModeloActual = "gemini-2.5-flash-lite";
let limiteTokensActual = 800;
let totalTokensInput = 0;
let totalTokensOutput = 0;
let chatSesiones = {};
let model = null;

const MODELOS_DISPONIBLES = {
    '3-pro': 'gemini-3-pro-preview',
    '2.5-pro': 'gemini-2.5-pro',
    '2.5-flash': 'gemini-2.5-flash',
    '2.5-lite': 'gemini-2.5-flash-lite',
    '2.0-flash': 'gemini-2.0-flash',
    '2.0-lite': 'gemini-2.0-flash-lite'
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const genAI = new GoogleGenerativeAI(API_KEY);

function cargarModelo(nombreTecnico) {
    console.log(`🔄 Cargando modelo: ${nombreTecnico} (Tokens: ${limiteTokensActual})...`);

    const dynamicGenerationConfig = {
        temperature: 1.0,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: limiteTokensActual,
        responseMimeType: "text/plain",
    };

    try {
        model = genAI.getGenerativeModel({
            model: nombreTecnico,
            systemInstruction: INSTRUCCIONES_BOT,
            safetySettings: safetySettings,
            generationConfig: dynamicGenerationConfig,
            tools: [
                { googleSearch: {} }
            ]
        });
        nombreModeloActual = nombreTecnico;
        chatSesiones = {};
        return true;
    } catch (e) {
        console.error("Error cargando modelo:", e);
        return false;
    }
}

cargarModelo(nombreModeloActual);

async function getSesion(chatId) {
    if (!chatSesiones[chatId]) {
        chatSesiones[chatId] = model.startChat({
            history: [],
        });
    }
    return chatSesiones[chatId];
}

// --- FUNCIÓN PARA CONVERTIR AUDIO (NUEVO) ---
function convertirAudioAMp3(mediaData) {
    return new Promise((resolve, reject) => {
        const tempDir = os.tmpdir();
        const timestamp = Date.now();
        const inputPath = path.join(tempDir, `input_${timestamp}.ogg`);
        const outputPath = path.join(tempDir, `output_${timestamp}.mp3`);

        // Decodificar base64 y guardar archivo temporalmente
        const buffer = Buffer.from(mediaData.data, 'base64');
        fs.writeFileSync(inputPath, buffer);

        console.log("🎵 Convirtiendo audio a MP3...");

        ffmpeg(inputPath)
            .toFormat('mp3')
            .on('error', (err) => {
                console.error('❌ Error en FFmpeg:', err);
                // Limpieza en caso de error
                try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch(e){}
                reject(err);
            })
            .on('end', () => {
                // Leer el archivo convertido
                try {
                    const mp3Buffer = fs.readFileSync(outputPath);
                    const mp3Base64 = mp3Buffer.toString('base64');

                    // Limpieza de archivos temporales
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);

                    console.log("✅ Audio convertido exitosamente.");

                    // Retornar el objeto media actualizado
                    resolve({
                        mimetype: 'audio/mp3',
                        data: mp3Base64,
                        filename: 'audio.mp3'
                    });
                } catch (err) {
                    reject(err);
                }
            })
            .save(outputPath);
    });
}

// --- FUNCIÓN HELPER PARA PROCESAR MEDIA (MODIFICADA) ---
async function procesarMedia(msg) {
    let media = null;

    if (msg.hasMedia) {
        media = await msg.downloadMedia();
    } else if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.hasMedia) {
            media = await quotedMsg.downloadMedia();
        }
    }

    if (media) {
        // Si es audio (normalmente audio/ogg; codecs=opus en whatsapp), lo convertimos
        if (media.mimetype.startsWith('audio') || media.mimetype.includes('ogg')) {
            try {
                return await convertirAudioAMp3(media);
            } catch (error) {
                console.error("⚠️ Falló la conversión de audio, enviando original:", error.message);
                return media; // Fallback: enviar original si falla
            }
        }
    }

    return media;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-features=NetworkService',
            '--disable-features=NetworkServiceInProcess'
        ]
    }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Whemini está listo y conectado.'));

client.on('message_create', async (msg) => {
    try {
        if (msg.timestamp < TIMESTAMP_INICIO) return;

        const mensaje = msg.body.trim();

        // --- COMANDO: INFO ---
        if (mensaje === '!info') {
            const infoMsg = `📊 *Estado de Whemini*\n\n` +
                            `🧠 *Modelo:* \`${nombreModeloActual}\`\n` +
                            `📏 *Límite Tokens:* ${limiteTokensActual}\n` +
                            `📥 *In:* ${totalTokensInput}\n` +
                            `📤 *Out:* ${totalTokensOutput}\n` +
                            `📈 *Total:* ${totalTokensInput + totalTokensOutput}`;
            await msg.reply(infoMsg);
            return;
        }

        // --- COMANDO: TOKENS ---
        if (mensaje.startsWith('!tokens ')) {
            const arg = mensaje.slice(8).trim();
            const nuevoLimite = parseInt(arg);
            if (!isNaN(nuevoLimite) && nuevoLimite > 0 && nuevoLimite <= 8192) {
                limiteTokensActual = nuevoLimite;
                if (cargarModelo(nombreModeloActual)) {
                    await msg.reply(`✅ *Límite actualizado.*\nNuevos tokens máximos: ${limiteTokensActual}.`);
                }
            } else {
                await msg.reply("❌ Número inválido.");
            }
            return;
        }

        // --- COMANDO: MODELO ---
        if (mensaje.startsWith('!modelo ')) {
            const alias = mensaje.slice(8).trim().toLowerCase();
            const nombreTecnico = MODELOS_DISPONIBLES[alias];
            if (nombreTecnico) {
                if (cargarModelo(nombreTecnico)) {
                    await msg.reply(`✅ Cambio exitoso a: \`${nombreTecnico}\`.`);
                }
            } else {
                const lista = Object.keys(MODELOS_DISPONIBLES).map(k => `• ${k}`).join('\n');
                await msg.reply(`❌ Modelo no válido. Opciones:\n${lista}`);
            }
            return;
        }

        // --- COMANDO: RESET ---
        if (mensaje === '!reset') {
            const chat = await msg.getChat();
            const chatId = chat.id._serialized;
            if (chatSesiones[chatId]) delete chatSesiones[chatId];
            await msg.reply("🤖 Whemini: *Memoria reiniciada.*");
            return;
        }

        // --- INTERACCIÓN CON EL BOT ---
        // Detectar si es un comando !bot o si es un mensaje de audio directo (sin texto)
        // Nota: Para audios, whatsapp a veces no trae "body" visible fácilmente si es nota de voz.
        const esComandoBot = mensaje.toLowerCase().startsWith('!bot');

        // Si es comando explícito O si hay multimedia (asumimos que quiere procesarlo si nos etiqueta o responde,
        // pero aquí mantenemos la lógica de !bot para no ser invasivos).
        if (esComandoBot) {
            const consulta = mensaje.slice(4).trim();
            const chat = await msg.getChat();
            const chatId = chat.id._serialized;

            console.log(`📩 [${nombreModeloActual}] Cmd en ${chat.name || chatId}`);
            chat.sendStateTyping();

            // 1. Procesar Media (Convierte Audio si es necesario)
            const mediaData = await procesarMedia(msg);

            // 2. Construir Payload
            let geminiPayload = [];

            if (mediaData) {
                console.log(`📎 Media adjunto: ${mediaData.mimetype}`);
                const filePart = {
                    inlineData: {
                        data: mediaData.data,
                        mimeType: mediaData.mimetype
                    }
                };
                geminiPayload.push(filePart);
            }

            // 3. Definir el prompt de texto
            if (consulta) {
                geminiPayload.push(consulta);
            } else if (mediaData) {
                if (mediaData.mimetype.startsWith('audio')) {
                    geminiPayload.push("Escucha este audio atentamente, transcribe lo que dice y responde o resume su contenido.");
                } else if (mediaData.mimetype.startsWith('image')) {
                    geminiPayload.push("Describe esta imagen.");
                } else {
                    geminiPayload.push("Analiza este archivo.");
                }
            }

            // 4. Enviar a Gemini
            const sesion = await getSesion(chatId);
            const result = await sesion.sendMessage(geminiPayload);
            const response = await result.response;

            if (response.usageMetadata) {
                totalTokensInput += response.usageMetadata.promptTokenCount;
                totalTokensOutput += response.usageMetadata.candidatesTokenCount;
            }

            const text = response.text();
            await msg.reply(text);
            chat.clearState();
        }

    } catch (error) {
        console.error("❌ Error:", error);
        if (msg.body.startsWith('!bot')) {
            await msg.reply(`🤖 Whemini: ⚠️ Error: ${error.message}`);
        }
    }
});

const SEGUNDOS_DE_ESPERA = 10;
console.log(`⏳ Esperando ${SEGUNDOS_DE_ESPERA} segundos...`);
setTimeout(() => {
    console.log("🚀 Iniciando...");
    client.initialize();
}, SEGUNDOS_DE_ESPERA * 1000);