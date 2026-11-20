FROM stalwartlabs/stalwart:v1.1.0@sha256:f772aa6ef8cd8018969fa491640f1436b0270eb14e2c219b5f37f1a77020837e

ARG STALWART_CLI_VERSION=1.0.14
ARG BUILD_TIMESTAMP=2026-11-10-v1.1.0

USER root

COPY scripts/install-stalwart.sh /tmp/install-stalwart.sh
# No file capabilities: the pods drop every capability and forbid privilege escalation, so the kernel would refuse to exec it.
RUN sh /tmp/install-stalwart.sh && rm /tmp/install-stalwart.sh

RUN apt-get -o Acquire::Retries=0 update \
    && apt-get -o Acquire::Retries=0 upgrade -yq \
    && apt-get install -yq --no-install-recommends curl xz-utils \
    && curl -fsSL "https://github.com/stalwartlabs/cli/releases/download/v${STALWART_CLI_VERSION}/stalwart-cli-x86_64-unknown-linux-gnu.tar.xz" \
        | tar xJ -C /tmp \
    && mv /tmp/stalwart-cli-x86_64-unknown-linux-gnu/stalwart-cli /usr/local/bin/stalwart-cli \
    && rm -rf /tmp/stalwart-cli-x86_64-unknown-linux-gnu \
    && chmod 755 /usr/local/bin/stalwart-cli \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/log/stalwart /etc/stalwart /usr/local/share/stalwart

COPY stalwart/plan /usr/local/share/stalwart/plan
COPY stalwart/cli-schema.json /usr/local/share/stalwart/cli-schema.json
COPY stalwart/cli-schema.latest /usr/local/share/stalwart/cli-schema.latest
RUN chown -R stalwart:stalwart /var/log/stalwart /etc/stalwart /usr/local/share/stalwart

# Eight jemalloc arenas match the CPU quota, not the 48 host CPUs.
RUN ln -sfn 'background_thread:true,narenas:8' /etc/malloc.conf

USER stalwart

EXPOSE 25 8080

ENTRYPOINT ["/usr/local/bin/stalwart"]
