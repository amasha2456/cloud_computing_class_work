FROM nginx:alpine

ARG NGINX_CONF=nginx.conf

COPY . /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/nginx.aws.conf /usr/share/nginx/html/Dockerfile

COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf

EXPOSE 80
