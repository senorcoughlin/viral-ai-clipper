FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir -U "yt-dlp[default]"
WORKDIR /app
COPY server.py .
ENV PORT=8080 DATA_DIR=/data CONCURRENCY=4
EXPOSE 8080
CMD ["python", "-u", "server.py"]
