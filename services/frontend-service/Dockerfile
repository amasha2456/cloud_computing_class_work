FROM nginx:alpine

COPY . /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/Dockerfile

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
