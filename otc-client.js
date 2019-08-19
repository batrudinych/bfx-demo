const async = require('async')
const { PeerRPCServer, PeerRPCClient } = require('grenache-nodejs-http')
const { getId, noop, isInterested } = require('./utils')
const { defaults } = require('./config')

class OTCClient {
  constructor ({
    link,
    port,
    broadcastKey = defaults.broadcastKey,
    announceInterval = defaults.announceInterval,
    requestOptions = defaults.requestOptions
  }) {
    this._initialized = false
    this._id = getId()
    this._link = link
    this._port = port
    this._sentOffers = {}
    this._interestingOffers = {}
    this._broadcastKey = broadcastKey
    this._announceInterval = announceInterval
    this._requestOptions = requestOptions
    this._processingQueue = []
    this._interval = null
    this._clientPeer = null
    this._serverPeer = null
    this._service = null
  }

  init () {
    if (!this._initialized) {
      this._clientPeer = new PeerRPCClient(this._link, {})
      this._clientPeer.init()
      this._serverPeer = new PeerRPCServer(this._link, {})
      this._serverPeer.init()
      this._service = this._serverPeer.transport('server')
      this._service.listen(this._port)
      this._initialized = true

      this._service.on('request', this._onRequest.bind(this))
    }
  }

  startAnnouncing (cb) {
    if (!this._initialized) {
      const err = new Error('OTCClient should be initialized first')
      if (!cb) {
        throw err
      }
      return cb(err)
    }
    cb = cb || noop

    async.parallel(
      [
        cb => this._link.announce(this._broadcastKey, this._service.port, {}, cb),
        cb => this._link.announce(this._id, this._service.port, {}, cb)
      ],
      (err) => {
        console.log(this._id, 'started')
        if (!err) {
          this._interval = setInterval(() => {
            this._link.announce(this._broadcastKey, this._service.port, {})
            this._link.announce(this._id, this._service.port, {})
          }, this._announceInterval)
        }
        cb(err)
      }
    )
  }

  stopAnnouncing (cb) {
    if (!this._initialized) {
      const err = new Error('OTCClient should be initialized first')
      if (!cb) {
        throw err
      }
      return cb(err)
    }
    cb = cb || noop
    clearInterval(this._interval)
    this._interval = null
    setImmediate(cb)
  }

  sendOffer ({ type, amount, unitPrice }, cb) {
    const payload = {
      cmd: 'offer:new',
      body: {
        offerId: getId(),
        source: this._id,
        type,
        amount,
        unitPrice
      }
    }
    this._sentOffers[payload.body.offerId] = {
      contents: payload.body,
      flags: {
        inProcess: false,
        approved: false
      }
    }
    this._clientPeer.map(this._broadcastKey, payload, this._requestOptions, cb)
  }

  _onRequest (rid, key, payload, handler) {
    const { cmd, body } = payload
    if (!cmd || !body) {
      handler.reply(new Error('Message format is incorrect'))
      return
    }
    const cmdHandlers = {
      [this._id]: {
        'offer:accept': this._onOfferApprovalRequest.bind(this),
        'offer:accept:approved': this._onOfferApproved.bind(this)
      },
      [this._broadcastKey]: {
        'offer:new': this._onOfferNew.bind(this),
        'offer:done': this._onOfferDone.bind(this)
      }
    }

    console.log('cmd %s, key %s, requester %s, rid %s', cmd, key, body.destination || 'none', rid)
    const reqHandler = cmdHandlers[key] && cmdHandlers[key][cmd]

    if (!reqHandler) {
      console.log('No handler found', rid)
      handler.reply(new Error('Unable to handle the command'))
      return
    }

    return reqHandler(body, handler, rid)
  }

  _onOfferApprovalRequest (body, handler, rid) {
    const { source, offerId } = body
    const offer = this._sentOffers[offerId]

    if (!offer || source !== this._id) {
      return handler.reply(new Error('The offer has not been found'))
    }

    if (offer.flags.approved) {
      return handler.reply(null, false)
    }

    // TODO: no need to respond, result is acknowledged separately
    handler.reply(null, true)

    this._processingQueue.push(body)
    if (!offer.flags.inProcess) {
      offer.flags.inProcess = true
      this._startQueueProcessing(rid, (err, approved) => {
        // err will never have a value here
        if (err) {
          throw err
        }

        offer.flags.approved = approved
        offer.flags.inProcess = false
        this._processingQueue = []
        if (approved) {
          delete this._sentOffers[offer.contents.offerId]
          const payload = {
            cmd: 'offer:done',
            body: { offerId: offer.contents.offerId }
          }
          this._clientPeer.map(this._broadcastKey, payload, this._requestOptions)
        }
      })
    }
  }

  _onOfferApproved (body, handler, rid) {
    if (!this._interestingOffers[body.offerId]) {
      // The client has no interest in the offer, most probably an error
      return handler.reply(new Error('Client has no interest in the offer'))
    }
    console.log(
      '\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '\nGot the offer', rid,
      '\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n'
    )
    delete this._interestingOffers[body.offerId]
    handler.reply()
  }

  _onOfferNew (body, handler, rid) {
    // TODO: no need to respond
    handler.reply()
    // Do not process own offers
    if (body.source !== this._id) {
      console.log('Received a new offer from', body.source, rid)
      // Added in testing purposes in order to control execution flow
      if (isInterested(body)) {
        console.log('Trying to accept', body.source, rid)
        // Put into list of interesting offers
        this._interestingOffers[body.offerId] = body
        // Send an acceptance
        const payload = {
          cmd: 'offer:accept',
          body: {
            offerId: body.offerId,
            source: body.source,
            destination: this._id
          }
        }
        this._clientPeer.request(body.source, payload, this._requestOptions, (err, result) => {
          // The source received the acceptance
          if (result) {
            console.log('Acceptance has been received', body.source, rid)
            return
          }

          delete this._interestingOffers[body.offerId]
          if (err) {
            console.log('Failed to accept the offer of', body.source, rid)
            console.log('Reason:', err.message, rid)
            return
          }
          console.log('Offer is already accepted', rid)
        })
      }
    }
  }

  _onOfferDone (body, handler, rid) {
    delete this._interestingOffers[body.offerId]
    // TODO: no need to respond
    handler.reply()
  }

  _startQueueProcessing (rid, cb) {
    const processAcceptance = () => {
      const acceptCmdBody = this._processingQueue.shift()
      if (acceptCmdBody) {
        const payload = {
          cmd: 'offer:accept:approved',
          body: {
            offerId: acceptCmdBody.offerId,
            source: acceptCmdBody.source,
            destination: acceptCmdBody.destination
          }
        }
        // Hopefully this always acts asynchronously. Otherwise, will need to use setImmediate
        console.log('Notifying approved person', acceptCmdBody.destination, rid)
        this._clientPeer.request(acceptCmdBody.destination, payload, this._requestOptions, err => {
          if (err) {
            // On a failure we move to the next acceptance
            console.log('Failed to approve for', acceptCmdBody.destination, rid)
            return processAcceptance()
          }
          console.log('Approved for', acceptCmdBody.destination, rid)
          cb(null, true)
        })
      } else {
        setImmediate(() => {
          if (this._processingQueue.length) {
            return processAcceptance()
          }
          cb(null, false)
        })
      }
    }

    processAcceptance()
  }
}

module.exports = OTCClient
