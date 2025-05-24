# Fluid Particles Docker

基于WebGL的实时粒子流体模拟与渲染的Docker部署和优化版本。

![流体模拟预览](http://david.li/images/fluidgithub.png)

原项目: [http://david.li/fluid](http://david.li/fluid) ([视频演示](http://www.youtube.com/watch?v=DhNt_A3k4B4))

## 项目说明

这个项目是对[David Li的流体模拟项目](http://david.li/fluid)的Docker化部署和优化。通过Docker容器技术，可以快速部署和运行这个基于WebGL的3D流体模拟应用。

## 特性

- 基于WebGL的实时3D流体模拟
- 使用粒子系统实现流体效果
- 通过Docker容器轻松部署
- 自动化GitHub Actions工作流程构建和发布Docker镜像

## 快速开始

### 使用Docker Compose运行

```bash
docker-compose up -d
```

然后在浏览器中访问 http://localhost:9000

### 使用Docker Hub镜像运行

```bash
docker run -p 9000:80 ghcr.io/1os3/fluid_docker:latest
```

## 开发

### 本地开发

克隆仓库后，可以直接在浏览器中打开`fluid/index.html`文件进行开发和测试。

### 构建Docker镜像

```bash
docker build -t fluid-particles .
```

## 部署

### GitHub Pages 部署

项目配置了自动部署到GitHub Pages的工作流。每次推送到main分支时，会自动：

1. 构建项目文件
2. 部署到GitHub Pages
3. 可通过 `https://[用户名].github.io/[仓库名]` 访问

### Docker 部署

项目使用GitHub Actions自动构建和发布Docker镜像。每次推送到main分支时，都会触发构建流程并发布新的镜像版本。

## 许可证

与原项目保持一致。
