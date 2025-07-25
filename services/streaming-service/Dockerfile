# services/streaming-service/Dockerfile
# Dockerfile for the Streaming Service

# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (optional, as it's event-driven)
# EXPOSE 7003

# Define the command to run the app
CMD ["node", "services/streaming-service/streamingService.js"]