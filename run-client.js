'use strict'

if (!process.argv[2]) {
  console.log('Pass the port number as the first argument to the script')
  process.exit(1)
}

const Link = require('grenache-nodejs-link')
const OTCClient = require('./otc-client')
const config = require('./config')

const GRAPE_ADDRESS = `http://${config.grapes.host}:${config.grapes.ports[0].api}`
const port = Number(process.argv[2])

const link = new Link({
  grape: GRAPE_ADDRESS
})
link.start()

const otcClient = new OTCClient({
  link,
  port
})

otcClient.init()

otcClient.startAnnouncing((err) => {
  if (err) {
    console.log(err, 'Failed to announce service')
    process.exit(1)
  }
  if (process.argv[3]) {
    otcClient.sendOffer({ type: 'buy', amount: 1, price: 8000 }, (err) => {
      if (err) throw err
      console.log('Offer sent')
    })
  }
})
