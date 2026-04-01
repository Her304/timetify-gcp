# Step 1: Build the React app
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Step 2: Use Nginx to serve the build folder
FROM nginx:stable-alpine
# Copy the built files from Step 1 to Nginx's public folder
COPY --from=build /app/dist /usr/share/nginx/html

# Create a template Nginx config
RUN echo 'server { \
    listen 8080; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expose the default Cloud Run port
EXPOSE 8080

# Use sed to replace the port number in the config file at runtime
CMD ["/bin/sh", "-c", "sed -i 's/listen 8080/listen '\"$PORT\"'/g' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
