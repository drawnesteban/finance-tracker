FROM node:22-alpine
WORKDIR /app
COPY server/ ./
COPY public/ ./public/
ENV PORT=4440 DATA_ROOT=/data
EXPOSE 4440
CMD ["node", "server.js"]
