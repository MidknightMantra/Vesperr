FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Create logs directory
RUN mkdir -p logs session

# Expose API port
EXPOSE 3000

# Start bot
CMD ["node", "index.js"]
