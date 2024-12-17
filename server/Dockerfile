# Build stage
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o server main.go

# Run stage
FROM alpine:3.18
WORKDIR /app
COPY --from=builder /app/server .

EXPOSE 9090
ENTRYPOINT [ "/app/server" ]
