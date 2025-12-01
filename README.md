# 🤖 Whemini - Bot de WhatsApp Multimedia con IA

**Whemini** es un asistente inteligente para WhatsApp potenciado por los modelos más recientes de **Google Gemini**, ahora con soporte completo para **audio**, **imágenes**, **archivos** y **menciones reales** en grupos.

A diferencia de bots simples, Whemini incluye **memoria contextual por chat**, capacidades multimodales, búsqueda en internet y un sistema robusto de identificación de usuarios.

## ✨ Características

* **🗣️ Audio y Voz:** Procesa notas de voz de WhatsApp, las transcribe y responde.
* **👁️ Visión y Documentos:** Analiza imágenes, PDFs y otros archivos adjuntos.
* **🆔 Identidad de Usuario:** Reconoce quién escribe en grupos sin depender de la agenda del usuario.
* **🏷️ Menciones Reales:** Puede etiquetar usuarios con su número para generar notificaciones reales.
* **🧠 Multi-Modelo:** Cambia entre Gemini 2.0, 2.5 y 3.0 Pro/Flash mediante comandos.
* **🌐 Grounding (Google Search):** La IA puede buscar información actualizada.
* **📝 Memoria por Chat:** Mantiene contexto separado para cada conversación.
* **⚙️ Configuración Dinámica:** Ajusta modelo y tokens sin reiniciar.
* **📊 Métricas de Consumo:** Consulta tokens usados y límites activos.
* **🎨 Formato Rico:** Usa negritas, listas y bloques de código en WhatsApp.
* **🛡️ Seguridad:** Filtra mensajes viejos y usa variables de entorno.

## 🛠️ Requisitos Previos

* [Node.js](https://nodejs.org/) 18 o superior.
* **FFmpeg** para procesar notas de voz.
* Cuenta de WhatsApp (personal o secundaria).
* **API Key de Google Gemini** (gratuita desde Google AI Studio).

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

3. **Configurar variables de entorno:**

   ```bash
   cp .env.example .env
   ```

   Editar y añadir tu API Key:

   ```env
   GEMINI_API_KEY=Tu_Clave_Aqui_Sin_Espacios
   ```

4. **Configurar instrucciones del sistema:**
   Editar `instructions.txt` para definir reglas de menciones con el formato `@numerotelefono`.

5. **Iniciar el bot:**

   ```bash
   node index.js
   ```

6. **Vincular WhatsApp:**
   Escanear el código QR desde “Dispositivos vinculados”.

## 💬 Guía de Uso

### Interacción Básica

* **Texto:** `!bot Hola`
* **Imágenes:** Enviar imagen con `!bot describí esto` o sin comando si hay contexto.
* **Audios:** Enviar una nota de voz; el bot la procesará.

### Identidad y Menciones

* El bot reconoce usuarios y puede etiquetar:

  * `!bot Decile a @Lucas que venga.`
  * Respuesta: *"Che @54zzzzzzzxxxx te llaman."*

## 📡 Comandos

| Comando           | Descripción                               |
| :- | :- |
| `!bot <texto>`    | Comando principal para consultar a la IA. |
| `!reset`          | Limpia memoria del chat actual.           |
| `!info`           | Muestra modelo, tokens y configuraciones. |
| `!modelo <alias>` | Cambia el modelo de IA.                   |
| `!tokens <num>`   | Ajusta longitud máxima de respuesta.      |

### Modelos Disponibles

* `2.5-lite`
* `2.5-flash`
* `2.5-pro`
* `3-pro`
* `2.0-flash`
* `2.0-lite` (Por defecto, funciona mejor con el sistema de menciones)

## 📄 Licencia y Aviso Legal

Proyecto educativo y de código abierto. No afiliado a WhatsApp ni Google. Evitar spam para prevenir suspensiones.
