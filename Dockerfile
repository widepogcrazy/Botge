ARG NODE_VERSION=23.1.0

FROM node:${NODE_VERSION}-alpine as build

WORKDIR /app

COPY package*.json .

RUN npm install

COPY . .

RUN npm run build

FROM node:${NODE_VERSION}-alpine as release

WORKDIR /app

RUN apk add --update ffmpeg

COPY package*.json .

RUN npm ci --only=production

COPY --from=build /app/dist ./dist

USER node

VOLUME ["/app/temp_gifs"]

CMD ["node", "dist/index.js"]