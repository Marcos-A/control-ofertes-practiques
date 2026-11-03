FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY script.gs ./
COPY tests ./tests
CMD ["node", "--test", "tests/**/*.test.js"]
