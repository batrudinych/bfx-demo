const { PeerRPCServer, PeerRPCClient } = require('grenache-nodejs-http')
const { announceInterval } = require('../config')
const async = require('async')

module.exports.init = (link, port, clientId, cb) => {
  const clientPeer = new PeerRPCClient(link, {})
  clientPeer.init()

  const serverPeer = new PeerRPCServer(link, {})
  serverPeer.init()

  const service = serverPeer.transport('server')
  service.listen(port)

  async.parallel(
    [
      cb => link.announce('common', service.port, {}, cb),
      cb => link.announce(clientId, service.port, {}, cb)
    ],
    (err) => {
      cb(err)
      if (!err) {
        setInterval(() => {
          link.announce('common', service.port, {})
          link.announce(clientId, service.port, {})
        }, announceInterval)
      }
    }
  )

  return { serverPeer, clientPeer, service }
}
