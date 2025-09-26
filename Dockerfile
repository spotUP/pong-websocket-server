# Use the official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the current directory contents into the container at /app
COPY . .

# Build the TypeScript code
RUN npm run build

# Make port available to the world outside this container
EXPOSE $PORT

# Define the command to run the app
CMD ["npm", "start"]