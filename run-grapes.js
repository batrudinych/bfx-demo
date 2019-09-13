const async = require('async')
const Grape = require('grenache-grape').Grape
const config = require('./config')
const grapesConfig = config.grapes

const onEvent = (grapeNum, event, msg, params) => {
  console.log(`${grapeNum} : ${event} : ${msg}`)
  console.log(params)
}

const grapes = grapesConfig.ports.map((ports, index) => {
  const grape = new Grape({
    dht_port: ports.dht,
    dht_bootstrap: grapesConfig.ports.reduce((acc, val) => {
      if (val.dht !== ports.dht) {
        acc.push(`${grapesConfig.host}:${val.dht}`)
      }
      return acc
    }, []),
    api_port: ports.api
  })

  grape.on('ready', (...params) => onEvent(index, 'ready', 'DHT bootstrapped', params))
  grape.on('listening', (...params) => onEvent(index, 'listening', 'DHT listening', params))
  grape.on('node', (...params) => onEvent(index, 'node', 'Node found', params))
  grape.on('peer', (...params) => onEvent(index, 'peer', 'Peer found', params))
  grape.on('warning', (...params) => onEvent(index, 'warning', 'Warning', params))
  grape.on('announce', (...params) => onEvent(index, 'announce', 'Peer announced itself', params))

  return grape
})

async.each(grapes, (grape, cb) => {
  grape.start(cb)
}, (err, res) => {
  if (err) {
    console.log('Failed to start all the grapes')
    console.log(err)
    process.exit(1)
  }
  console.log('Grapes have been started successfully')
})
