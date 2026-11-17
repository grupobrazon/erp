# Servidor das funções de backend (Deno), as antigas funções da Base44.
FROM denoland/deno:2.9.6
WORKDIR /app
COPY server ./server
COPY src/api/b44compat.js src/api/entityColumns.js ./src/api/
COPY base44/shared ./base44/shared
RUN deno cache server/main.ts
USER deno
EXPOSE 8000
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "server/main.ts"]
