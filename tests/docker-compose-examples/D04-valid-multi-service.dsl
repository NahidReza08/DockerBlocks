compose {
  service frontend {
    image nginx
    port 8080 -> 80
    environment NODE_ENV = production
    volume "./frontend" -> "/usr/share/nginx/html"
  }
  service backend {
    image node:20
    port 3000 -> 3000
    environment NODE_ENV = production
    environment API_PORT = 3000
    volume "./data" -> "/app/data"
  }
}
