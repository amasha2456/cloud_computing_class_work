FROM apache/superset:latest

USER root
RUN uv pip install --python /app/.venv/bin/python clickhouse-connect psycopg2-binary

COPY superset_config.py /app/pythonpath/superset_config.py
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER superset

EXPOSE 8088

ENTRYPOINT ["/app/docker-entrypoint.sh"]
