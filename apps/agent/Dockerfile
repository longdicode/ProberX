FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY agent-linux /usr/local/bin/agent
EXPOSE 9800
ENV AGENT_PORT=9800
CMD ["agent"]
