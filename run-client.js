'use strict'

if (!process.argv[2]) {
  console.log('Pass the port number as the first argument to the script')
  process.exit(1)
}

const Link = require('grenache-nodejs-link')
const { getId } = require('./helpers/utils')
const { init: initService } = require('./helpers/service')
const { init: initHandlers } = require('./helpers/handlers')
const config = require('./config')

const GRAPE_ADDRESS = `http://${config.grapes.host}:${config.grapes.ports[0].api}`
const SERVICE_PORT = Number(process.argv[2])
const clientId = getId()

const link = new Link({
  grape: GRAPE_ADDRESS
})
link.start()

const { service, clientPeer } = initService(link, SERVICE_PORT, clientId, (err) => {
  if (err) {
    console.log('Failed to initialize services')
    process.exit(1)
  }

  const { cmdHandlers, sendOffer } = initHandlers(clientId, clientPeer)

  service.on('request', (rid, key, payload, handler) => {
    const { cmd, body } = payload
    if (!cmd || !body) {
      handler.reply(new Error('Message format is incorrect'))
      return
    }
    console.log('cid %s, key %s, cmd %s, rid %s', clientId, key, cmd, rid)
    const reqHandler = cmdHandlers[key] && cmdHandlers[key][cmd]

    if (!reqHandler) {
      console.log('No handler found', rid)
      handler.reply(new Error('Unable to handle the command'))
      return
    }

    return reqHandler(body, handler, rid)
  })

  if (process.argv[3]) {
    sendOffer({ type: 'buy', amount: 1, price: 8000 }, (err, result) => {
      if (err) throw err
      console.log('Offer sent')
    })
  }
})
