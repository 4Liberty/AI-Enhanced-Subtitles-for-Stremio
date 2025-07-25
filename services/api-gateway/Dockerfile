# services/api-gateway/Dockerfile
# Dockerfile for the API Gateway service

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

# Expose the port the app runs on
EXPOSE 7000

# Define the command to run the app
CMD ["node", "services/api-gateway/gateway.js"]