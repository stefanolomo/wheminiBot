
# 🤖 Whemini - Bot de WhatsApp con IA

**Whemini** es un asistente inteligente para WhatsApp potenciado por los modelos más recientes de **Google Gemini**.

A diferencia de bots simples, Whemini tiene **memoria contextual** (recuerda lo que se habla en cada chat), capacidad de **búsqueda en Google en tiempo real** y permite cambiar de modelo de IA sobre la marcha.

## ✨ Características

- **🧠 Multi-Modelo:** Cambia entre Gemini 2.0, 2.5 y 3.0 Pro/Flash mediante comandos.
- **🌐 Grounding (Google Search):** La IA puede buscar información actualizada en internet si se lo pides.
- **📝 Memoria por Chat:** Mantiene el hilo de la conversación separado para cada usuario o grupo.
- **⚙️ Configuración Dinámica:** Ajusta el límite de tokens (longitud de respuesta) sin reiniciar el bot.
- **📊 Métricas de Consumo:** Consulta cuántos tokens has gastado en la sesión actual.
- **🎨 Formato Rico:** Utiliza negritas, listas, citas y bloques de código de WhatsApp nativamente.
- **🛡️ Privacidad y Seguridad:** Filtra mensajes viejos al reiniciar para evitar spam y usa variables de entorno.

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
   *Nota: Si usas Linux/Servidor, asegúrate de tener las dependencias de Chromium instaladas.*

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
   *El bot esperará 10 segundos de seguridad antes de iniciar para garantizar conexión a internet.*

5. **Vincular WhatsApp:**
   Al iniciar, verás un código QR en la terminal. Escanéalo con la opción "Dispositivos vinculados" de tu WhatsApp.

## 💬 Comandos de Uso

### Comandos Básicos
| Comando | Descripción |
| :--- | :--- |
| `!bot <texto>` | Envía un mensaje a la IA. Ejemplo: `!bot ¿Quién ganó el mundial 2022?` |
| `!reset` | Borra la memoria de la conversación actual (útil si la IA se confunde). |
| `!info` | Muestra el modelo actual, límite de tokens y estadísticas de consumo. |

### Configuración Avanzada
| Comando | Descripción |
| :--- | :--- |
| `!modelo <alias>` | Cambia el modelo de IA en tiempo real. (Reinicia la memoria). |
| `!tokens <cantidad>` | Cambia el límite máximo de tokens de respuesta (1 - 8192). |

### Modelos Disponibles (Alias)
*   `3-pro` (Gemini 1.5 Pro Preview)
*   `2.5-pro`
*   `2.5-flash`
*   `2.5-lite` (Modelo por defecto)
*   `2.0-flash`
*   `2.0-lite`

**Ejemplo:** `!modelo 2.5-flash`

## ⚙️ Tecnologías

- [whatsapp-web.js](https://wwebjs.dev/): Cliente de WhatsApp para Node.js.
- [Google Generative AI SDK](https://www.npmjs.com/package/@google/generative-ai): Conexión con Gemini.
- [QRCode Terminal](https://www.npmjs.com/package/qrcode-terminal): Generación del QR en consola.
- [Dotenv](https://www.npmjs.com/package/dotenv): Gestión segura de credenciales.

## ⚠️ Aviso Legal

Este proyecto no está afiliado, asociado, autorizado, avalado ni conectado oficialmente de ninguna manera con WhatsApp ni con Google. 

Es un proyecto educativo y de código abierto. El uso de bots en cuentas personales de WhatsApp debe hacerse con responsabilidad para evitar suspensiones temporales o permanentes por parte de la plataforma si se detecta spam.