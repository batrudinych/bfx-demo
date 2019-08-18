const crypto = require('crypto')

const ID_LENGTH = 8

module.exports.getId = () => crypto.randomBytes(ID_LENGTH).toString('hex')

// Added in testing purposes
module.exports.isInterested = (body) => body.amount === 1
