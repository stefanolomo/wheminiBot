// Carga variables de entorno desde el archivo .env
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
// Importamos también las categorías de seguridad y umbrales
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// Validación de API Key
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("❌ ERROR: No se encontró la variable GEMINI_API_KEY en el archivo .env");
    process.exit(1);
}

const NOMBRE_MODELO = "gemini-2.5-flash-lite";

// --- CONFIGURACIÓN DE GENERACIÓN (AJUSTES TÉCNICOS) ---
const generationConfig = {
    temperature: 1.0,       // Estándar (Creatividad balanceada)
    topP: 0.95,            // Estándar
    topK: 64,              // Estándar
    maxOutputTokens: 3000, // Límite máximo de respuesta
    responseMimeType: "text/plain",
};

// --- AJUSTES DE SEGURIDAD (BAJADOS AL MÍNIMO) ---
const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    // Nota: 'Civic Integrity' no siempre se puede ajustar libremente en todos los modelos,
    // pero las categorías principales arriba suelen ser suficientes para "bajar" la seguridad general.
];


// Definición del comportamiento y formato del bot
const INSTRUCCIONES_BOT = `
    [Formateado de WhatsApp]

    Negrita: *texto*
    Itálica: _texto_
    Tachado: ~texto~
    Código (inline): \`texto\`

    Lista enumerada (escribir así):
    1. texto
    2. texto

    Lista no enumerada (escribir así):
    * texto
    * texto

    Bloque de cita (escribir así):
    > texto

    Reglas:
    - No poner espacios entre el marcador y el texto (correcto: *hola*, incorrecto: * hola *)
    - Solo usar estos formatos, sin HTML ni Markdown externo.
    - Para mostrar los símbolos sin formatear, evitar marcadores o usar comillas (ej: “*texto*”).

    [Instrucciones generales]

    Eres un asistente útil integrado en WhatsApp.
    Tu nombre es "Whemini".
    Usa el voseo.
    Responde siempre de forma breve y concisa porque es un chat.
    Si te preguntan tu creador, di que fuiste creado por stef.
    Puedes explayarte en tu respuesta si es que te lo piden.
    Siempre tus mensajes tienen que empezar con una linea que diga: "🤖 Whemini:"
`;

// Configuración del modelo de Gemini
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
    model: NOMBRE_MODELO,
    systemInstruction: INSTRUCCIONES_BOT
});

// Diccionario para mantener la memoria por chat ID (grupo o privado)
const chatSesiones = {};

// Obtiene o crea una sesión de chat con Gemini
async function getSesion(chatId) {
    if (!chatSesiones[chatId]) {
        chatSesiones[chatId] = model.startChat({
            history: [],
            generationConfig: {
                maxOutputTokens: 800,
            },
        });
    }
    return chatSesiones[chatId];
}

// Configuración del cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
    }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Whemini está listo y conectado.'));

// Manejo de mensajes entrantes
client.on('message_create', async (msg) => {
    try {
        const mensaje = msg.body.trim();

        // Comando para reiniciar la memoria del chat actual
        if (mensaje === '!reset') {
            const chat = await msg.getChat();
            const chatId = chat.id._serialized;
            if (chatSesiones[chatId]) {
                delete chatSesiones[chatId];
                await msg.reply("🤖 Whemini: *Memoria reiniciada.* He olvidado nuestra charla anterior.");
            } else {
                await msg.reply("🤖 Whemini: No tenía nada en memoria para borrar.");
            }
            return;
        }

        // Filtro: Solo responder si el mensaje empieza con el comando
        if (mensaje.toLowerCase().startsWith('!bot ')) {

            const consulta = mensaje.slice(5); // Remueve el comando inicial
            const chat = await msg.getChat();
            const chatId = chat.id._serialized;

            console.log(`📩 Comando recibido en ${chat.name || chatId}: "${consulta}"`);

            // Simula estado "escribiendo..."
            chat.sendStateTyping();

            // Obtiene la sesión y envía el mensaje a la IA
            const sesion = await getSesion(chatId);
            const result = await sesion.sendMessage(consulta);
            const text = result.response.text();

            // Envía la respuesta
            await msg.reply(text);
            chat.clearState();
        }

    } catch (error) {
        console.error("❌ Error:", error);
        if (msg.body.startsWith('!bot')) {
            await msg.reply("🤖 Whemini: ⚠️ Ocurrió un error procesando tu mensaje.");
        }
    }
});

client.initialize();