# Build stage
FROM golang:1.22-alpine AS builder

RUN mkdir -p $GOPATH/src/app
WORKDIR $GOPATH/src/app

COPY . ./
RUN export CGO_ENABLED=0 && \
    export GOOS=linux && \
    go build -o server server/main.go && \
    mv ./server /

# Run stage
FROM alpine:3.18
WORKDIR /app
COPY --from=builder server .

EXPOSE 9090
ENTRYPOINT [ "/main" ]
