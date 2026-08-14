# Step 1: Build the React app
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# `npm run build` also runs scripts/prerender.mjs (see package.json), which
# writes the per-route static HTML heads. VITE_API_URL comes from the tracked
# .env.production, so nothing needs to be passed in as a build arg.
RUN npm run build

# Step 2: Serve the build with Nginx
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

# The nginx image entrypoint runs envsubst over /etc/nginx/templates/*.template
# and drops the result in /etc/nginx/conf.d/ before starting. That replaces the
# old sed-the-port-at-runtime hack.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Cloud Run overrides PORT; the default keeps local `docker run` working.
ENV PORT=8080
# Origin nginx proxies /sitemap.xml to. Override per environment if the backend
# service is renamed.
ENV BACKEND_HOST=timetify-web-931972332433.us-central1.run.app

EXPOSE 8080
