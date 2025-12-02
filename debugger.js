const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Inicializar Cliente
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('🔍 Bot de Debugging Listo.'));

client.on('message_create', async (msg) => {
    // Evitar bucles infinitos: no responder a nuestros propios reportes de debug
    if (msg.body.startsWith('🔍 *REPORTE DE DEBUG*')) return;

    console.log("📨 Mensaje recibido. Generando reporte...");

    try {
        let output = `🔍 *REPORTE DE DEBUG* 🔍\n\n`;

        // ---------------------------------------------------------
        // 1. INTENTOS DE OBTENER EL NÚMERO (IDENTIFICACIÓN)
        // ---------------------------------------------------------
        output += `🆔 *IDENTIFICACIÓN DEL REMITENTE*\n`;

        // Método A: Propiedades Directas Standard
        output += `🔹 msg.from: \`${msg.from}\`\n`;
        output += `🔹 msg.author: \`${msg.author || 'undefined'}\`\n`;

        // Método B: Propiedad ID anidada
        output += `🔹 msg.id.participant: \`${msg.id.participant || 'undefined'}\`\n`;
        output += `🔹 msg.id.remote: \`${msg.id.remote}\`\n`;

        // Método C: Data Cruda (_data) - A veces tiene datos que la librería no expone
        const raw = msg._data || {};
        output += `🔹 msg._data.from: \`${raw.from || 'undef'}\`\n`;
        output += `🔹 msg._data.author: \`${raw.author || 'undef'}\`\n`;
        output += `🔹 msg._data.participant: \`${raw.participant || 'undef'}\`\n`;
        if (raw.id) {
            output += `🔹 msg._data.id.participant: \`${raw.id.participant || 'undef'}\`\n`;
        }

        // Método D: Inyección en el Navegador (Lo más avanzado para resolver LIDs)
        let navegadorData = "Error";
        try {
            // Obtenemos el ID que creemos que es el emisor (author si es grupo, from si es privado)
            const targetId = msg.author || msg.from;

            navegadorData = await client.pupPage.evaluate((targetId) => {
                try {
                    const wid = window.Store.WidFactory.createWid(targetId);
                    const info = {};

                    // 1. Intentar resolver LID a Telefono
                    if (window.Store.LidUtils && window.Store.LidUtils.getPhoneNumber) {
                        const pn = window.Store.LidUtils.getPhoneNumber(wid);
                        if (pn) info.mappedPhoneNumber = pn._serialized;
                    }

                    // 2. Buscar en el Store de Contactos
                    const contact = window.Store.Contact.get(wid);
                    if (contact) {
                        info.pushname = contact.pushname;
                        info.isMyContact = contact.isMyContact;
                        info.isUser = contact.isUser;
                        info.phoneNumber = contact.phoneNumber; // A veces está aquí
                    }
                    return JSON.stringify(info);
                } catch(e) { return "Error en browser: " + e.message; }
            }, targetId);
        } catch (e) { navegadorData = "Fallo Puppeteer: " + e.message; }

        output += `🔹 *Browser Store Lookup:* \`\`\`${navegadorData}\`\`\`\n`;

        // Método E: Función getContact() (Suele fallar, la probamos igual)
        try {
            const contact = await msg.getContact();
            output += `🔹 msg.getContact(): Nro: \`${contact.number}\` | Name: \`${contact.name}\` | Push: \`${contact.pushname}\`\n`;
        } catch (e) {
            output += `🔹 msg.getContact(): ❌ FALLÓ (${e.message})\n`;
        }

        // ---------------------------------------------------------
        // 2. CONTEXTO DEL CHAT
        // ---------------------------------------------------------
        output += `\n🏠 *CONTEXTO DEL CHAT*\n`;
        const chat = await msg.getChat();

        output += `🔸 Es Grupo: ${chat.isGroup ? 'SÍ' : 'NO'}\n`;
        output += `🔸 Nombre Chat: ${chat.name}\n`;
        output += `🔸 Chat ID: \`${chat.id._serialized}\`\n`;

        if (chat.isGroup) {
            // Buscar al emisor en la lista de participantes
            const idBusqueda = msg.author || msg.from;
            const participante = chat.participants.find(p => p.id._serialized === idBusqueda);
            if (participante) {
                output += `🔸 Info Participante en Grupo: Admin? ${participante.isAdmin} | SuperAdmin? ${participante.isSuperAdmin}\n`;
            } else {
                output += `🔸 ⚠️ El emisor NO aparece en la lista de participantes del objeto Chat (¿Bug de LIDs?)\n`;
            }
        }

        // ---------------------------------------------------------
        // 3. DATOS DEL CLIENTE (Tú)
        // ---------------------------------------------------------
        output += `\n🤖 *INFO DEL CLIENTE (BOT)*\n`;
        output += `▫️ Mi ID: \`${client.info.wid._serialized}\`\n`;
        output += `▫️ Mi Nombre: ${client.info.pushname}\n`;
        output += `▫️ Plataforma: ${client.info.platform}\n`;

        // Enviar respuesta
        await msg.reply(output);

    } catch (error) {
        console.error("Error fatal en debug:", error);
        await msg.reply(`⚠️ Error fatal generando reporte: ${error.message}`);
    }
});

client.initialize();