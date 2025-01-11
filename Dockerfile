FROM golang:1.22-alpine

# Add git for downloading dependencies
RUN apk add --no-cache git
WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

COPY . ./
COPY static/ static/

RUN ls

RUN go build -o main cmd/main.go

EXPOSE 8080

CMD ["./main"]