# Stage 1: compile the Go program.
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

# Stage 2: a small image containing only the compiled program.
FROM alpine:3.20
RUN adduser -D -u 10001 app
COPY --from=build /out/server /usr/local/bin/server
USER app
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["server"]
