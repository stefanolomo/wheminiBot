// Carga variables de entorno desde el archivo .env
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
let nombreModeloActual = "gemini-2.0-flash-lite";
let limiteTokensActual = 650;
let totalTokensInput = 0;
let totalTokensOutput = 0;
let chatSesiones = {};
let model = null;

// --- MAPA DE MODELOS DISPONIBLES ---
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

// --- INICIALIZACIÓN DE LA IA ---
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

// --- FUNCIÓN PARA CONVERTIR AUDIO ---
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
                try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch(e){}
                reject(err);
            })
            .on('end', () => {
                try {
                    const mp3Buffer = fs.readFileSync(outputPath);
                    const mp3Base64 = mp3Buffer.toString('base64');

                    // Limpieza
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);

                    console.log("✅ Audio convertido exitosamente.");

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

// --- FUNCIÓN HELPER PARA PROCESAR MEDIA ---
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
        // Detectar audios (Whatsapp suele usar audio/ogg; codecs=opus)
        if (media.mimetype.startsWith('audio') || media.mimetype.includes('ogg')) {
            try {
                return await convertirAudioAMp3(media);
            } catch (error) {
                console.error("⚠️ Falló la conversión de audio, enviando original:", error.message);
                return media;
            }
        }
    }

    return media;
}

// --- HELPER PARA RESOLVER NÚMEROS ---
async function obtenerNumeroReal(msg, client) {
    // 1. CASO PROPIO: Si el mensaje es mío (del bot), usar info del cliente
    if (msg.fromMe) {
        if (client.info && client.info.wid) {
            return client.info.wid.user;
        }
    }

    // 2. OBTENER ID CANDIDATO
    let idCandidato = msg.author || msg.from;

    // Si ya es un teléfono (@c.us), lo usamos directo
    if (idCandidato && idCandidato.includes('@c.us')) {
        return idCandidato.replace(/\D/g, '');
    }

    // 3. BUSCAR EN METADATA OCULTA (_data)
    // A veces id.participant tiene el número real aunque author tenga el LID
    if (msg._data) {
        if (msg._data.id && msg._data.id.participant && msg._data.id.participant.includes('@c.us')) {
            return msg._data.id.participant.replace(/\D/g, '');
        }
        // Fallback extra para algunos casos de grupo
        if (msg._data.participant && msg._data.participant.includes('@c.us')) {
            return msg._data.participant.replace(/\D/g, '');
        }
    }

    // 4. INYECCIÓN BROWSER
    // Buscamos en el Store de Contactos de WhatsApp Web
    try {
        const telefonoMapeado = await client.pupPage.evaluate((targetId) => {
            try {
                // Aseguramos formato LID si es solo números
                if (!targetId.includes('@')) targetId = targetId + '@lid';

                const wid = window.Store.WidFactory.createWid(targetId);

                // Estrategia A: LidUtils (Para mapeo LID -> Phone)
                if (window.Store.LidUtils && window.Store.LidUtils.getPhoneNumber) {
                    const pn = window.Store.LidUtils.getPhoneNumber(wid);
                    if (pn && pn.user) return pn.user; // Devolvemos SOLO el número string
                }

                // Estrategia B: Buscar en Contact Store
                const contact = window.Store.Contact.get(wid);
                if (contact) {
                    if (contact.userid) return contact.userid; // Mejor propiedad para user real
                    if (contact.phoneNumber) return contact.phoneNumber;
                    if (contact.id && contact.id.user && contact.id.server === 'c.us') {
                        return contact.id.user;
                    }
                }
                return null;
            } catch(e) { return null; }
        }, idCandidato);

        // Verificamos que sea TEXTO antes de usar replace (Aquí fallaba antes)
        if (telefonoMapeado && typeof telefonoMapeado === 'string') {
            return telefonoMapeado.replace(/\D/g, '');
        }
    } catch (e) {
        console.error("⚠️ Falló resolución profunda de LID:", e.message);
    }

    // 5. FALLBACK FINAL: Devolvemos lo que haya
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
        const esComandoBot = mensaje.toLowerCase().startsWith('!bot');

        if (esComandoBot) {
            const consulta = mensaje.slice(4).trim();
            const chat = await msg.getChat();
            const chatId = chat.id._serialized;

            // --- IDENTIFICACIÓN DEL USUARIO ---
            const numeroUsuario = await obtenerNumeroReal(msg, client);
            const nombreUsuario = msg._data.notifyName || "Usuario";

            // LOGUEO DETALLADO
            let logTexto = consulta;
            if (!logTexto && (msg.hasMedia || msg.hasQuotedMsg)) {
                logTexto = "[Archivo Adjunto/Citado]";
            }
            console.log(`📩 [${nombreModeloActual}] De: ${numeroUsuario} (${nombreUsuario}) en ${chat.name || chatId}: "${logTexto}"`);

            chat.sendStateTyping();

            // 1. Procesar Media
            const mediaData = await procesarMedia(msg);

            // 2. Construir Contexto de Identidad
            const contextoUsuario = `[Sistema: El mensaje proviene del número +${numeroUsuario}, el usuario se llama "${nombreUsuario}". Úsalo si es relevante para responder].\n\n`;

            // 3. Construir Payload para Gemini
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

            if (consulta) {
                // Inyectamos el contexto antes del texto del usuario
                geminiPayload.push(contextoUsuario + consulta);
            } else if (mediaData) {
                // Prompt por defecto si solo hay media, con contexto incluido
                let promptMedia = contextoUsuario;
                if (mediaData.mimetype.startsWith('audio')) {
                    promptMedia += "Escucha este audio atentamente, pone en texto todo lo que dice y responde o resume su contenido.";
                } else if (mediaData.mimetype.startsWith('image')) {
                    promptMedia += "Describe esta imagen.";
                } else {
                    promptMedia += "Analiza este archivo.";
                }
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

            // --- LÓGICA DE MENCIONES (TAGGING) ---
            // Basado en Client.js: pasamos un array de IDs serializados en las options.
            const mentions = [];

            // Regex busca patrones @numero (ej: @54911223344)
            const patronMencion = /@(\d+)/g;
            let match;

            while ((match = patronMencion.exec(text)) !== null) {
                const numeroEncontrado = match[1];
                // Construimos el ID serializado standard de WhatsApp (@c.us)
                // Esto permite taggear gente NO agendada.
                const serializedId = `${numeroEncontrado}@c.us`;
                mentions.push(serializedId);
            }

            // 5. Responder a WhatsApp con las menciones procesadas
            await msg.reply(text, undefined, { mentions: mentions });

            chat.clearState();
        }

    } catch (error) {
        console.error("❌ Error:", error);
        if (msg.body.startsWith('!bot')) {
            await msg.reply(`🤖 Whemini: ⚠️ Error: ${error.message}`);
        }
    }
});

// --- ESPERA DE SEGURIDAD ---
const SEGUNDOS_DE_ESPERA = 5;
console.log(`⏳ Esperando ${SEGUNDOS_DE_ESPERA} segundos...`);

setTimeout(() => {
    console.log("🚀 Iniciando...");
    client.initialize();
}, SEGUNDOS_DE_ESPERA * 1000);