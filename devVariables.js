module.exports = {
    // getCurrentImageVersions: `{
    //             "obolnetwork/charon": "v0.15.0",
    //             "sigp/lighthouse": "v4.0.2-rc.0"
    //             }`,
    getCurrentImageVersions: `{
                "obolnetwork/charon": "v0.15.0",
                "sigp/lighthouse": "v4.1.0",
                "consensys/teku": "23.3.1",
                "prom/prometheus": "v2.41.0",
                "grafana/grafana": "9.3.2",
                "prom/node-exporter": "v1.5.0",
                "jaegertracing/all-in-one": "1.41.0"
                }`,
    getLatestImageVersion: {
        "obolnetwork/charon": "v0.15.0",
        "sigp/lighthouse": "v4.1.0",
        "consensys/teku": "23.4.0",
        "prom/prometheus": "v2.43.0",
        "grafana/grafana": "9.5.1",
        "prom/node-exporter": "v1.5.0",
        "jaegertracing/all-in-one": "1.44.0",
    },
    getGitHubRepoURL: {
        "obolnetwork/charon": "https://github.com/obolnetwork/charon",
        "sigp/lighthouse": "https://github.com/sigp/lighthouse",
        "consensys/teku": "https://github.com/consensys/teku",
        "prom/prometheus": "https://github.com/prometheus/prometheus",
        "grafana/grafana": "https://github.com/grafana/grafana",
        "prom/node-exporter": "https://github.com/prometheus/node_exporter",
        "jaegertracing/all-in-one": "https://github.com/jaegertracing/jaeger",
    },
    updateDockerComposeFile: {
        "obolnetwork/charon": {
            indentation: "2",
            updatedLine: "image: obolnetwork/charon:${CHARON_VERSION:-v0.15.0}",
        },
        "sigp/lighthouse": {
            indentation: "4",
            updatedLine: "image: sigp/lighthouse:${LIGHTHOUSE_VERSION:-v4.1.0}",
        },
        "consensys/teku": {
            indentation: "4",
            updatedLine: "image: consensys/teku:${TEKU_VERSION:-23.4.0}",
        },
        "prom/prometheus": {
            indentation: "4",
            updatedLine: "image: prom/prometheus:${PROMETHEUS_VERSION:-v2.43.0}",
        },
        "grafana/grafana": {
            indentation: "4",
            updatedLine: "image: grafana/grafana:${GRAFANA_VERSION:-9.5.1}",
        },
        "prom/node_exporter": {
            indentation: "4",
            updatedLine: "image: prom/node-exporter:${NODE_EXPORTER_VERSION:-v1.5.0}",
        },
        "jaegertracing/all-in-one": {
            indentation: "4",
            updatedLine: "image: jaegertracing/all-in-one:${JAEGAR_VERSION:-1.44.0}",
        },
    },
}
