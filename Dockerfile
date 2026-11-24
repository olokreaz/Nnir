# Статический сайт NNIR на nginx
FROM nginx:1.27-alpine

# Фронтенд: страницы сайта
COPY sites/ /usr/share/nginx/html/

# Статические ресурсы: css, картинки и т.п.
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80