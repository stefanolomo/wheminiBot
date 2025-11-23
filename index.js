// Carga variables de entorno desde el archivo .env
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// --- MARCA DE TIEMPO DE INICIO ---
const TIMESTAMP_INICIO = Math.floor(Date.now() / 1000);

// Validación de API Key
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("❌ ERROR: No se encontró la variable GEMINI_API_KEY en el archivo .env");
    process.exit(1);
}

// --- VARIABLES GLOBALES DE ESTADO ---
let nombreModeloActual = "gemini-2.5-flash-lite";
let limiteTokensActual = 800;
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

const INSTRUCCIONES_BOT = `
    [Formateado de WhatsApp]
    Negrita: *texto*
    Itálica: _texto_
    Tachado: ~texto~
    Código (inline): \`texto\`
    Lista enumerada:
    1. texto
    2. texto
    Bloque de cita:
    > texto

    Reglas:
    - No poner espacios entre el marcador y el texto.
    - Usar un solo tipo de estilo por línea.
    - No usar * para negrita y para bullet point en una sola linea. Si usas una no uses la otra. En ese caso usá "-"
    - Solo usar estos formatos, sin HTML ni Markdown externo.

    [Instrucciones IMPORTANTES]
    Eres un asistente integrado en WhatsApp llamado "Whemini".
    Usa el voseo.
    Responde de forma breve y concisa (es un chat).
    Si recibes una imagen o documento, analízalo y responde según el contexto.
    Si te preguntan tu creador, di que fuiste creado por stef.
    Siempre tus mensajes tienen que empezar con una línea que diga: "🤖 Whemini:"
    Debes responder a todo lo que se te pregunte.
`;

// --- INICIALIZACIÓN DE LA IA ---
const genAI = new GoogleGenerativeAI(API_KEY);

// Función para cargar/cambiar el modelo y configuración dinámicamente
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

// Cargar modelo inicial
cargarModelo(nombreModeloActual);

// --- GESTIÓN DE SESIONES ---
async function getSesion(chatId) {
    if (!chatSesiones[chatId]) {
        chatSesiones[chatId] = model.startChat({
            history: [],
        });
    }
    return chatSesiones[chatId];
}

// --- FUNCIÓN HELPER PARA PROCESAR MEDIA (NUEVO) ---
async function procesarMedia(msg) {
    if (msg.hasMedia) {
        return await msg.downloadMedia();
    }
    if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.hasMedia) {
            return await quotedMsg.downloadMedia();
        }
    }
    return null;
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

        // --- COMANDO: INFO Y CONSUMO ---
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

        // --- COMANDO: CAMBIAR LÍMITE DE TOKENS ---
        if (mensaje.startsWith('!tokens ')) {
            const arg = mensaje.slice(8).trim();
            const nuevoLimite = parseInt(arg);

            if (!isNaN(nuevoLimite) && nuevoLimite > 0 && nuevoLimite <= 8192) {
                limiteTokensActual = nuevoLimite;
                if (cargarModelo(nombreModeloActual)) {
                    await msg.reply(`✅ *Límite actualizado.*\nNuevos tokens máximos: ${limiteTokensActual}.\n_(Memoria reiniciada)_`);
                } else {
                    await msg.reply("❌ Error interno al actualizar configuración.");
                }
            } else {
                await msg.reply("❌ Número inválido. Ingresa un valor entre 1 y 8192.");
            }
            return;
        }

        // --- COMANDO: CAMBIAR MODELO ---
        if (mensaje.startsWith('!modelo ')) {
            const alias = mensaje.slice(8).trim().toLowerCase();
            const nombreTecnico = MODELOS_DISPONIBLES[alias];

            if (nombreTecnico) {
                if (cargarModelo(nombreTecnico)) {
                    await msg.reply(`✅ Cambio exitoso a: \`${nombreTecnico}\`\n_(Memoria reiniciada)_`);
                } else {
                    await msg.reply("❌ Error interno al cambiar de modelo.");
                }
            } else {
                const lista = Object.keys(MODELOS_DISPONIBLES).map(k => `• ${k}`).join('\n');
                await msg.reply(`❌ Modelo no válido. Opciones:\n${lista}`);
            }
            return;
        }

        // --- COMANDO: RESET MEMORIA ---
        if (mensaje === '!reset') {
            const chat = await msg.getChat();
            const chatId = chat.id._serialized;
            if (chatSesiones[chatId]) {
                delete chatSesiones[chatId];
                await msg.reply("🤖 Whemini: *Memoria reiniciada.*");
            } else {
                await msg.reply("🤖 Whemini: No había nada que olvidar.");
            }
            return;
        }

        // --- INTERACCIÓN CON EL BOT (MULTIMODAL) ---
        // Detecta si empieza con !bot O si hay media adjunta y caption con !bot
        if (mensaje.toLowerCase().startsWith('!bot')) {
            const consulta = mensaje.slice(4).trim(); // Removemos "!bot "
            const chat = await msg.getChat();
            const chatId = chat.id._serialized;

            console.log(`📩 [${nombreModeloActual}] Cmd en ${chat.name || chatId}: "${consulta}"`);
            chat.sendStateTyping();

            // 1. Verificar si hay imagen/pdf (directo o citado)
            const mediaData = await procesarMedia(msg); // <--- NUEVA FUNCIÓN

            // 2. Construir el payload para Gemini
            let geminiPayload = [];

            if (mediaData) {
                console.log(`🖼️ Imagen/PDF detectado: ${mediaData.mimetype}`);
                // Convertir formato wwebjs a formato Gemini
                const imagePart = {
                    inlineData: {
                        data: mediaData.data, // Ya viene en base64
                        mimeType: mediaData.mimetype
                    }
                };
                geminiPayload.push(imagePart);
            }

            // Agregar el texto (si existe)
            if (consulta) {
                geminiPayload.push(consulta);
            } else if (mediaData) {
                // Si envía foto sin texto, ponemos un prompt por defecto
                geminiPayload.push("Describe esto.");
            }

            // 3. Enviar a Gemini
            const sesion = await getSesion(chatId);
            // sendMessage acepta un array de partes (texto + imágenes)
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

// --- ESPERA DE SEGURIDAD ---
const SEGUNDOS_DE_ESPERA = 10;
console.log(`⏳ Esperando ${SEGUNDOS_DE_ESPERA} segundos...`);

setTimeout(() => {
    console.log("🚀 Iniciando...");
    client.initialize();
}, SEGUNDOS_DE_ESPERA * 1000);