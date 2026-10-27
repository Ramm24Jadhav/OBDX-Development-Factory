# OBDX Development Factory as a container image. Used by docker-compose.yml; build alone with: docker build -t obdx-factory .
#
# Behind a corporate proxy, pass it as build arguments (docker build --build-arg HTTPS_PROXY=http://proxy:8080 ...,
# or the "proxies" section of ~/.docker/config.json). If the proxy or an internal server (SVN, model, Maven or npm
# mirror) uses a certificate from the bank's own CA, put the CA certificate (.crt, PEM) in deploy/docker/certs/.

# ---- Build: the JET UI and the server jar (Maven downloads Node.js itself) ----
FROM maven:3.9-eclipse-temurin-21 AS build
ARG HTTPS_PROXY
ARG NO_PROXY
COPY deploy/docker/certs/ /tmp/certs/
COPY deploy/docker/trust-certs.sh /usr/local/bin/
RUN trust-certs.sh /tmp/certs
# Node.js (the UI build) reads its extra CAs from this file.
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
WORKDIR /src
COPY . .
# Maven does not read HTTPS_PROXY by itself, so a proxy given as a build argument goes into its settings.
RUN --mount=type=cache,target=/root/.m2/repository \
    --mount=type=cache,target=/root/.npm \
    if [ -n "$HTTPS_PROXY" ]; then \
      hostport="${HTTPS_PROXY#*://}"; hostport="${hostport%/}"; hostport="${hostport##*@}"; \
      printf '<settings><proxies><proxy><id>build</id><active>true</active><protocol>https</protocol><host>%s</host><port>%s</port><nonProxyHosts>%s</nonProxyHosts></proxy></proxies></settings>\n' \
        "${hostport%:*}" "${hostport##*:}" "$(echo "${NO_PROXY:-localhost}" | tr ',' '|')" > /root/.m2/settings.xml; \
    fi \
    && mvn -B -q -DskipTests package \
    && cp factory-server/target/obdx-factory.jar /obdx-factory.jar

# ---- Run ----
FROM eclipse-temurin:21-jre
# svn and svnmucc (subversion) for importing and delivering code; curl for the health check and demo setup.
RUN apt-get update \
    && apt-get install -y --no-install-recommends subversion curl \
    && rm -rf /var/lib/apt/lists/*
COPY deploy/docker/certs/ /tmp/certs/
COPY deploy/docker/trust-certs.sh /usr/local/bin/
RUN trust-certs.sh /tmp/certs && rm -rf /tmp/certs
RUN useradd --system --home-dir /var/lib/obdx-factory --create-home obdxfactory \
    && mkdir /svn && chown obdxfactory /svn
COPY --from=build /obdx-factory.jar /opt/obdx-factory/obdx-factory.jar
COPY deploy/docker/factory-entrypoint.sh deploy/docker/demo-setup.sh deploy/docker/svn-entrypoint.sh /usr/local/bin/
# Demo codebases for the demo SVN server (docker-compose.yml runs this image as svnserve too).
COPY deploy/docker/demo/ /demo/
USER obdxfactory
WORKDIR /var/lib/obdx-factory
ENV FACTORY_DATA_DIR=/var/lib/obdx-factory \
    JAVA_OPTS="-XX:MaxRAMPercentage=75"
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
    CMD curl -fsS "http://localhost:${FACTORY_PORT:-8080}${FACTORY_CONTEXT_PATH:-}/actuator/health" > /dev/null || exit 1
ENTRYPOINT ["factory-entrypoint.sh"]
