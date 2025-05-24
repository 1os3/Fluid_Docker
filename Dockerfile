FROM nginx:alpine

# 复制应用文件到Nginx的默认目录
COPY ./fluid /usr/share/nginx/html

# 复制自定义Nginx配置
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# 暴露80端口
EXPOSE 80

# 启动Nginx
CMD ["nginx", "-g", "daemon off;"]
