# Build: docker build -t cardgame-server ./server
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /server
COPY --from=build /out/migrate /migrate
COPY --from=build /out/seed /seed
# Production defaults: secure cookies, no dev sign-in.
# Deploy steps: /migrate up, then /seed (catalog + recipes; safe to re-run).
ENV PORT=8080 APP_ENV=prod
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
