const { broadcastKey, requestOptions } = require('../config')
const { getId, isInterested } = require('./utils')
/**
 *  A dictionary of handlers for supported service keys and underline commands
 *  The service registers two keys: common and <client id>
 *  Key common used for broadcast
 *  Key <client id> is used for straightforward link
 *  Also, a helper function to publish an offer
 */

module.exports = {
  init: (clientId, clientPeer) => {
    // Hold a map of offers the client is interested in
    const interestingOffers = {}
    // Hold a map of offers the client has initiated
    const sentOffers = {}
    let processingQueue = []

    function startQueueProcessing (queue, offer, rid, cb) {
      offer.flags.inProcess = true

      function processAcceptance () {
        const acceptCmdBody = queue.shift()
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
          clientPeer.request(acceptCmdBody.destination, payload, requestOptions, err => {
            if (err) {
              console.log('Failed to approve for', acceptCmdBody.destination, rid)
              processAcceptance(queue, offer)
              return
            }
            console.log('Approved for', acceptCmdBody.destination, rid)
            offer.flags.approved = true
            offer.flags.inProcess = false
            cb()
            processingQueue = []
          })
        } else {
          offer.flags.inProcess = false
        }
      }

      processAcceptance(queue, offer)
    }

    return {
      cmdHandlers: {
        [clientId]: {
          'offer:accept:approved': (body, handler, rid) => {
            if (!interestingOffers[body.offerId]) {
              // The client has no interest in the offer, most probably an error
              handler.reply(new Error('Client has no interest in the offer'))
              return
            }
            console.log(clientId, 'got the offer', rid)
            delete interestingOffers[body.offerId]
            handler.reply()
          },
          'offer:accept': (body, handler, rid) => {
            const offer = sentOffers[body.offerId]
            if (!offer || body.source !== clientId) {
              return handler.reply(new Error('The offer has not been found'))
            }
            if (offer.flags.approved) {
              return handler.reply(null, false)
            }
            // TODO: no need to respond, result is acknowledged separately
            handler.reply(null, true)

            processingQueue.push(body)
            if (!offer.flags.inProcess) {
              startQueueProcessing(processingQueue, offer, rid, () => {
                const payload = {
                  cmd: 'offer:done',
                  body: { offerId: offer.offerId }
                }
                // TODO: no need to respond
                clientPeer.map('common', payload, requestOptions)
              })
            }
          }
        },
        [broadcastKey]: {
          'offer:new': (body, handler, rid) => {
            // TODO: no need to respond
            handler.reply()
            // Do not process own offers
            if (body.source !== clientId) {
              console.log('Received a new offer from', body.source, rid)
              // Added in testing purposes in order to control execution flow
              if (isInterested(body)) {
                console.log('Trying to accept', body.source, rid)
                // Put into list of interesting offers
                interestingOffers[body.offerId] = body
                // Send an acceptance
                const payload = {
                  cmd: 'offer:accept',
                  body: {
                    offerId: body.offerId,
                    source: body.source,
                    destination: clientId
                  }
                }
                clientPeer.request(body.source, payload, requestOptions, (err, result) => {
                  // The source received the acceptance
                  if (result) {
                    console.log('Acceptance has been received', body.source, rid)
                    return
                  }

                  delete interestingOffers[body.offerId]
                  if (err) {
                    console.log('Failed to accept the offer of', body.source, rid)
                    console.log(err, 'Reason', rid)
                    return
                  }
                  console.log('Offer is already accepted', rid)
                })
              }
            }
          },
          'offer:done': (body, handler, rid) => {
            delete interestingOffers[body.offerId]
            // TODO: no need to respond
            handler.reply()
          }
        }
      },
      sendOffer: ({ type, amount, unitPrice }, cb) => {
        const payload = {
          cmd: 'offer:new',
          body: {
            offerId: getId(),
            source: clientId,
            type,
            amount,
            unitPrice
          }
        }
        sentOffers[payload.body.offerId] = {
          contents: payload.body,
          flags: {
            inProcess: false,
            approved: false
          }
        }
        clientPeer.map(broadcastKey, payload, requestOptions, cb)
      }
    }
  }
}
