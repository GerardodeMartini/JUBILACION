# Usar una imagen base oficial de Node.js (versión LTS recomendada)
FROM node:18-alpine

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar los archivos de definición de dependencias
COPY package*.json ./
COPY server/package*.json ./server/

# Instalar dependencias del root (si las hay) y del servidor
RUN npm install
cd server && npm install

# Copiar el resto del código de la aplicación
COPY . .

# Exponer el puerto en el que corre la app (3001)
EXPOSE 3001

# Definir variables de entorno por defecto (pueden sobreescribirse en el despliegue)
ENV NODE_ENV=production
ENV PORT=3001

# Comando para iniciar la aplicación
# Asumimos que "npm start" en la raíz corre el servidor que sirve el frontend
CMD ["npm", "start", "--prefix", "server"]
