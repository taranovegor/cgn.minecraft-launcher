function getMainServer(servers) {
    const mainServer = servers.find(({ mainServer }) => mainServer)
    if (mainServer == null && servers.length > 0) {
        return servers[0]
    }
    return mainServer
}

module.exports = { getMainServer }
