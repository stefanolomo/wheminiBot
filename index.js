// --- START OF FILE index.js ---

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const ffmpeg = require('fluent-ffmpeg');

// --- MARCA DE TIEMPO DE INICIO ---
const TIMESTAMP_INICIO = Math.floor(Date.now() / 1000);

// Validación de API Key
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("❌ ERROR: No se encontró la variable GEMINI_API_KEY en el archivo .env");
    process.exit(1);
}

// --- CARGA DE INSTRUCCIONES ---
const RUTA_INSTRUCCIONES = path.join(__dirname, 'instructions.txt');
let INSTRUCCIONES_BOT = "";

try {
    INSTRUCCIONES_BOT = fs.readFileSync(RUTA_INSTRUCCIONES, 'utf8');
    console.log("✅ Instrucciones cargadas.");
} catch (error) {
    console.error(`❌ ERROR CRÍTICO: No se pudo leer 'instructions.txt'. ${error.message}`);
    process.exit(1);
}

// --- VARIABLES DE ESTADO ---
let nombreModeloActual = "gemini-2.0-flash-lite";
let limiteTokensActual = 650;
let totalTokensInput = 0;
let totalTokensOutput = 0;
let chatSesiones = {};
let model = null;

// --- MODELOS ---
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

// --- INICIALIZACIÓN GEMINI ---
const genAI = new GoogleGenerativeAI(API_KEY);

function cargarModelo(nombreTecnico) {
    console.log(`🔄 Modelo activo: ${nombreTecnico}`);
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
            tools: [{ googleSearch: {} }]
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
        chatSesiones[chatId] = model.startChat({ history: [] });
    }
    return chatSesiones[chatId];
}

// --- UTIL: CONVERTIR AUDIO ---
function convertirAudioAMp3(mediaData) {
    return new Promise((resolve, reject) => {
        const tempDir = os.tmpdir();
        const timestamp = Date.now();
        const inputPath = path.join(tempDir, `input_${timestamp}.ogg`);
        const outputPath = path.join(tempDir, `output_${timestamp}.mp3`);

        const buffer = Buffer.from(mediaData.data, 'base64');
        fs.writeFileSync(inputPath, buffer);

        ffmpeg(inputPath)
            .toFormat('mp3')
            .on('error', (err) => {
                try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch(e){}
                reject(err);
            })
            .on('end', () => {
                try {
                    const mp3Buffer = fs.readFileSync(outputPath);
                    const mp3Base64 = mp3Buffer.toString('base64');
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);
                    resolve({ mimetype: 'audio/mp3', data: mp3Base64, filename: 'audio.mp3' });
                } catch (err) { reject(err); }
            })
            .save(outputPath);
    });
}

// --- UTIL: PROCESAR MEDIA ---
async function procesarMedia(msg) {
    let media = null;
    if (msg.hasMedia) {
        media = await msg.downloadMedia();
    } else if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.hasMedia) media = await quotedMsg.downloadMedia();
    }

    if (media && (media.mimetype.startsWith('audio') || media.mimetype.includes('ogg'))) {
        try {
            return await convertirAudioAMp3(media);
        } catch (error) {
            console.error("⚠️ Falló conversión audio (usando original):", error.message);
            return media;
        }
    }
    return media;
}

// --- UTIL: OBTENER NÚMERO REAL (LID FIX) ---
async function obtenerNumeroReal(msg, client) {
    // 1. Si soy yo mismo
    if (msg.fromMe && client.info && client.info.wid) {
        return client.info.wid.user;
    }

    // 2. Si ya viene el número limpio (@c.us)
    let idCandidato = msg.author || msg.from;
    if (idCandidato && idCandidato.includes('@c.us')) {
        return idCandidato.replace(/\D/g, '');
    }

    // 3. Buscar en metadata oculta
    if (msg._data) {
        if (msg._data.id?.participant?.includes('@c.us')) return msg._data.id.participant.replace(/\D/g, '');
        if (msg._data.participant?.includes('@c.us')) return msg._data.participant.replace(/\D/g, '');
    }

    // 4. Inyección en Browser (Para amigos con LIDs)
    try {
        const telefonoMapeado = await client.pupPage.evaluate((targetId) => {
            try {
                if (!targetId.includes('@')) targetId = targetId + '@lid';
                const wid = window.Store.WidFactory.createWid(targetId);

                // Estrategia A: LidUtils
                if (window.Store.LidUtils?.getPhoneNumber) {
                    const pn = window.Store.LidUtils.getPhoneNumber(wid);
                    if (pn && pn.user) return pn.user;
                }
                // Estrategia B: Contact Store
                const contact = window.Store.Contact.get(wid);
                if (contact) {
                    if (contact.userid) return contact.userid;
                    if (contact.phoneNumber) return contact.phoneNumber;
                    if (contact.id?.user && contact.id.server === 'c.us') return contact.id.user;
                }
                return null;
            } catch(e) { return null; }
        }, idCandidato);

        if (telefonoMapeado && typeof telefonoMapeado === 'string') {
            return telefonoMapeado.replace(/\D/g, '');
        }
    } catch (e) {
        // Fallo silencioso en inyección
    }

    // 5. Fallback
    return idCandidato ? idCandidato.replace(/\D/g, '') : "Desconocido";
}

// --- CLIENTE WHATSAPP ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-features=NetworkService'
        ]
    }
});

// Eventos de conexión
client.on('qr', (qr) => {
    console.log("📲 Escanea el código QR:");
    qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
    console.log(`⌛ Cargando WhatsApp: ${percent}% (${message})`);
});

client.on('authenticated', () => {
    console.log('🔐 Autenticación exitosa.');
});

client.on('ready', () => console.log('✅ Whemini está listo y conectado.'));

// Lógica de Mensajes
client.on('message_create', async (msg) => {
    try {
        if (msg.timestamp < TIMESTAMP_INICIO) return;

        const mensaje = msg.body.trim();

        // --- COMANDOS BÁSICOS ---
        if (mensaje === '!info') {
            const infoMsg = `📊 *Estado de Whemini*\n🧠 Modelo: \`${nombreModeloActual}\`\n📏 Tokens Max: ${limiteTokensActual}\n📈 Uso: ${totalTokensInput} in / ${totalTokensOutput} out`;
            await msg.reply(infoMsg);
            return;
        }

        if (mensaje.startsWith('!tokens ')) {
            const arg = parseInt(mensaje.slice(8).trim());
            if (!isNaN(arg) && arg > 0 && arg <= 8192) {
                limiteTokensActual = arg;
                if (cargarModelo(nombreModeloActual)) await msg.reply(`✅ Tokens ajustados a: ${limiteTokensActual}`);
            }
            return;
        }

        if (mensaje.startsWith('!modelo ')) {
            const alias = mensaje.slice(8).trim().toLowerCase();
            const nombreTecnico = MODELOS_DISPONIBLES[alias];
            if (nombreTecnico) {
                if (cargarModelo(nombreTecnico)) await msg.reply(`✅ Modelo cambiado a: \`${nombreTecnico}\``);
            } else {
                await msg.reply(`❌ Modelos: ${Object.keys(MODELOS_DISPONIBLES).join(', ')}`);
            }
            return;
        }

        if (mensaje === '!reset') {
            const chatId = (await msg.getChat()).id._serialized;
            if (chatSesiones[chatId]) delete chatSesiones[chatId];
            await msg.reply("🤖 *Memoria reiniciada.*");
            return;
        }

        // --- LÓGICA IA ---
        if (mensaje.toLowerCase().startsWith('!bot')) {
            const consulta = mensaje.slice(4).trim();
            const chat = await msg.getChat();
            const chatId = chat.id._serialized;

            // 1. Identificar Usuario
            const numeroUsuario = await obtenerNumeroReal(msg, client);
            const nombreUsuario = msg._data.notifyName || "Usuario";

            console.log(`📩 [${nombreModeloActual}] De: ${numeroUsuario} (${nombreUsuario}): "${consulta || '[Media]'}"`);
            chat.sendStateTyping();

            // 2. Procesar Media
            const mediaData = await procesarMedia(msg);

            // 3. Preparar Prompt
            const contextoUsuario = `[Sistema: Mensaje de +${numeroUsuario}, nombre "${nombreUsuario}"].\n`;
            let geminiPayload = [];

            if (mediaData) {
                geminiPayload.push({
                    inlineData: { data: mediaData.data, mimeType: mediaData.mimetype }
                });
            }

            if (consulta) {
                geminiPayload.push(contextoUsuario + consulta);
            } else if (mediaData) {
                let promptMedia = contextoUsuario;
                if (mediaData.mimetype.startsWith('audio')) promptMedia += "Transcribe este audio y responde.";
                else if (mediaData.mimetype.startsWith('image')) promptMedia += "Describe esta imagen.";
                else promptMedia += "Analiza este archivo.";
                geminiPayload.push(promptMedia);
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

            // 5. Procesar Menciones (@numero)
            const mentions = [];
            const patronMencion = /@(\d+)/g;
            let match;
            while ((match = patronMencion.exec(text)) !== null) {
                mentions.push(`${match[1]}@c.us`);
            }

            await msg.reply(text, undefined, { mentions: mentions });
            chat.clearState();
        }

    } catch (error) {
        console.error("❌ Error en mensaje:", error);
        if (msg.body.startsWith('!bot')) await msg.reply(`🤖 Error: ${error.message}`);
    }
});

// --- INICIO ---
const SEGUNDOS_DE_ESPERA = 5;
console.log(`⏳ Iniciando en ${SEGUNDOS_DE_ESPERA}s...`);

setTimeout(() => {
    console.log("🚀 Iniciando cliente...");
    client.initialize();
}, SEGUNDOS_DE_ESPERA * 1000);