# bfx-demo
A demo application using Grenache and Grape. A `client` is a service, which consists of `PeerRPCServer` and `PeerRPCClient`. The `PeerRPCServer` is used for incoming connections and commands. The `PeerRPCClient` is used to send command to other peers.

### run-grapes.js
In order to get 3 grapes up execute
```$xslt
node ./run-grapes.js
```

### run-client.js
The script runs a client and accepts two parameters:
* [Required] A port to listen to
* [Optional] A value indicating whether the client should announce an offer

Once Grapes are up, in order to give a simple test, run several clients and one more, which will announce an offer (preferably in different terminals):
```$xslt
node ./run-client.js 1330
node ./run-client.js 1331
node ./run-client.js 1332
node ./run-client.js 1333 1
```
First 3 services announce nothing but they listen to an offer announcement with `1` as an amount (the code is injected in demonstration purposes). The fourth service announces an offer with `1` as amount. All the first 3 services send the acceptances but only 1 acceptance is fulfilled (usually the first one if no failures has happened)


## Foreword
The task is really interesting. This is something very different from what I do on daily basis.
I am NOT satisfied with the solution built from the architecture perspective due to several reasons:
* No scaling can be applied
* New clients can't get the ongoing offers
* The "P2P" connection through the unique id looks nasty

## Implementation
As Grape builds a DHT, which implements service discovery. Unfortunately, I was unable to find a way to connect peer to a certain peer right away. Thus, I decided to do a nasty hack: announce services with unique names bound to each client to be able to identify them. This way, a peer can be addressed using his unique id through the DHT. Consequently, each `PeerRPCServer` register two services: `common` and `<client id>`. `common` is used for broadcast messages and `<client id>` is used for direct communications.

Communication between client's is performed with commands. The command is a plain object and consists of two fields: `cmd` and `body`.
`cmd` may be one of the following: `offer:new`, `offer:done`, `offer:accept`, `offer:accept:approved`. 
The flow is expected to be the following:
* Client A announces a new offer with broadcasting `offer:new` command to the `common` services. The command body contains id of the offer, id of the source client and info about the offer itself
* Other clients receive the message and decide if they are interested. Interested clients send `offer:accept` command using the given offer id and client id
* Client A receives the commands. Upon receiving the very first command, Client A initializes a loop in order to approve one of the acceptances
* Client A sends `offer:accept:approved` command to the first accepted client and checks the result
* In case of a failure, the next accepted client is taken into consideration. If no other clients sent an acceptance, the looping will be stopped
* In case of a success, Client A sends broadcast message `offer:done`. Interested clients, whose acceptances were declined, remove the offer from the list of interesting

## Further considerations
* I'd love to refactor the codebase. The thing I am publishing right now is so messy that I hate myself. Also, I decided to proceed with callbacks as a lot of the code in Bitfinex repos are written using callbacks. To be honest, usually I promisify everything.
* Introduce input parameters for scripts and allow to send commands through command line. At the moment everything is tied together
* Some of the corner cases to be considered (like failure of the client, which sent an acceptance and so on)
* Unfortunately, I haven't find a way to omit `handle.reply` usage. Broadcast messages, for example, do not require a confirmation
* `PeerRPCClient.map` fails if the message can not be delivered to one of the addressees. Broadcast should not fail in that case. Initially I've built a separate broadcast service for that but decided to remove it at the end
* Message format and contents validation should be added
* Error handling to be improved. Error codes and format to be derived
* Logging also to be improved

---
P.S. I found a couple of issues in some of the repos during the development, will be happy to share if you're interested 
