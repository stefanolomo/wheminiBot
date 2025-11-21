# 🤖 Whemini - Bot de WhatsApp con IA

**Whemini** es un asistente inteligente para WhatsApp que utiliza el modelo **Gemini 2.5 Flash** de Google. 

A diferencia de bots simples, Whemini tiene **memoria contextual**: recuerda lo que se ha hablado en cada conversación (ya sea chat privado o grupo) de forma independiente.

## ✨ Características

- **Inteligencia Artificial:** Potenciado por Google Gemini 2.5 Flash.
- **Memoria por Chat:** Mantiene el hilo de la conversación separado para cada usuario o grupo.
- **Formato Rico:** Utiliza negritas, listas, citas y bloques de código de WhatsApp nativamente.
- **Personalidad Definida:** Asistente útil, conciso, con voseo y un toque de humor si se requiere.
- **Privacidad:** Solo responde cuando se le invoca mediante comandos, evitando el spam.

## 🛠️ Requisitos Previos

- [Node.js](https://nodejs.org/) (Versión 18 o superior).
- Una cuenta de WhatsApp (puedes usar tu número personal o uno secundario).
- Una API Key de Google Gemini (Gratuita en [Google AI Studio](https://aistudio.google.com/)).

## 🚀 Instalación

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/stefanolomo/whemini-bot.git
   cd whemini-bot
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar las variables de entorno:**
   Crea un archivo llamado `.env` en la raíz del proyecto basándote en el ejemplo:
   ```bash
   cp .env.example .env
   ```
   Abre el archivo `.env` y pega tu API Key de Google:
   ```env
   GEMINI_API_KEY=Tu_Clave_Aqui_Sin_Espacios
   ```

4. **Iniciar el bot:**
   ```bash
   node index.js
   ```

5. **Vincular WhatsApp:**
   Al iniciar, verás un código QR en la terminal. Escanéalo con la opción "Dispositivos vinculados" de tu WhatsApp.

## 💬 Comandos de Uso

| Comando | Descripción |
| :--- | :--- |
| `!bot <texto>` | Envía un mensaje a la IA. Ejemplo: `!bot dame una receta de torta` |
| `!reset` | Borra la memoria de la conversación actual (útil si la IA se confunde). |

## ⚙️ Tecnologías

- [whatsapp-web.js](https://wwebjs.dev/): Cliente de WhatsApp para Node.js.
- [Google Generative AI SDK](https://www.npmjs.com/package/@google/generative-ai): Conexión con Gemini.
- [QRCode Terminal](https://www.npmjs.com/package/qrcode-terminal): Generación del QR en consola.

## ⚠️ Aviso Legal

Este proyecto no está afiliado, asociado, autorizado, avalado ni conectado oficialmente de ninguna manera con WhatsApp ni con Google. 

Es un proyecto educativo y de código abierto. El uso de bots en cuentas personales de WhatsApp debe hacerse con responsabilidad para evitar suspensiones temporales o permanentes por parte de la plataforma si se detecta spam.
