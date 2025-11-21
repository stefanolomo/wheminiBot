# Guía para Configurar Auto-inicio de PM2 en Ubuntu Server

Este proceso asegura que tus aplicaciones de Node.js gestionadas por PM2 se levanten automáticamente cuando el servidor se reinicie o se encienda.

### 1. Instalar PM2 Globalmente
Si aún no lo tienes instalado de forma global, ejecuta:

```bash
sudo npm install -g pm2
```

### 2. Iniciar tu Aplicación
Primero, tu aplicación debe estar corriendo. Si ya la tienes iniciada, salta este paso. Si no, ve a la carpeta de tu proyecto e iníciala:

```bash
cd /ruta/a/tu/proyecto
pm2 start index.js --name "whemini"
```
*(Asegúrate de que la aplicación funciona correctamente con `pm2 status` antes de seguir).*

### 3. Generar el Script de Inicio
Este comando detecta tu sistema operativo (Ubuntu usa `systemd`) y genera un comando específico para tu usuario.

Ejecuta en la terminal:

```bash
pm2 startup
```

### 4. Ejecutar el Comando Generado (IMPORTANTE)
El comando anterior **NO** configura el auto-inicio por sí solo. Te mostrará en la consola una línea que empieza con `sudo env PATH=...`.

**Debes copiar esa línea entera, pegarla en tu terminal y darle Enter.**

Se verá parecido a esto (pero usa el que te dio tu terminal):
`sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u tu_usuario --hp /home/tu_usuario`

### 5. Congelar la Lista de Procesos
Una vez ejecutado el comando del paso 4, debes decirle a PM2: "Guarda los procesos que están corriendo AHORA MISMO para que sean los que arranquen al inicio".

Ejecuta:

```bash
pm2 save
```

Deberías ver un mensaje que dice `[PM2] Freeze a process list on reboot`.

---

### Verificación (Opcional)
Para estar 100% seguro, puedes reiniciar el servidor:

```bash
sudo reboot
```

Espera un minuto, vuelve a conectarte por SSH y ejecuta:

```bash
pm2 status
```
Deberías ver tu bot "online" con un `uptime` reciente.

---

### Comandos Útiles Adicionales

**Si haces cambios en el bot (agregas otro proceso):**
Siempre que agregues o quites aplicaciones de PM2, debes guardar la nueva lista:
```bash
pm2 save
```

**Si quieres desactivar el auto-inicio:**
```bash
pm2 unstartup systemd
```
