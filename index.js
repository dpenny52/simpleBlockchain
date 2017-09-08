const CryptoJS = require("crypto-js");
const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

let http_port = process.env.HTTP_PORT || 3000;
let p2p_port = process.env.P2P_PORT || 6000;
let initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

class Block {
  constructor(index, previousHash, timestamp, data, hash) {
    this.index = index;
    this.previousHash = previousHash.toString();
    this.timestamp = timestamp;
    this.data = data;
    this.hash = hash.toString();
  }
}

let sockets = [];
const MessageType = {
  QUERY_LATEST: 0,
  QUERY_ALL: 1,
  RESPONSE_BLOCKCHAIN: 2,
};

const getGenesisBlock = () => {
  return new Block(
    0,
    "0",
    1504892204,
    "This is the genesis block!",
    "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
};

let blockchain = [getGenesisBlock()];

const calculateHash = (index, previousHash, timestamp, data) => {
  return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
};

const calculateHashForBlock = (block) => {
  return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};

const generateNextBlock = (blockData) => {
  const previousBlock = getLatestBlock();
  const nextIndex = previousBlock.index + 1;
  const nextTimestamp = new Date().getTime() / 1000;
  const nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
  return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);
}

const isValidNewBlock = (newBlock, previousBlock) => {
  if (previousBlock.index + 1 !== newBlock.index) {
    console.log("Next block index is invalid.");
    return false;
  } else if (previousBlock.hash !== newBlock.previousHash) {
    console.log("Previous hash is invalid.");
    return false;
  } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
    console.log("Invalid hash: " + newBlock.hash + ' : should be : ' + calculateHashForBlock(newBlock));
    return false;
  }
  return true;
}

const addBlock = (newBlock) => {
  if (isValidNewBlock(newBlock, getLatestBlock())) {
    blockchain.push(newBlock);
  }
}

const getLatestBlock = () => blockchain[blockchain.length - 1];

const initExpressServer = () => {
  const app = express();
  app.use(bodyParser.json());

  app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));

  app.get('/peers', (req, res) => {
    res.send(sockets.map(s => s._socket.remoteAddress + ':" + s._socket.remotePort'));
  });

  app.post('/addPeer', (req, res) => {
    connectToPeers([req.body.peer]);
    res.send();
  });

  app.post('/mineBlock', (req, res) => {
    const newBlock = generateNextBlock(req.body.data);
    addBlock(newBlock);
    // broadcast(responseLatestMsg());
    console.log('block added: ' + JSON.stringify(newBlock));
    res.send();
  });

  app.listen(http_port, () => console.log('Listening on port ' + http_port));
}

var initMessageHandler = (ws) => {
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    console.log('Received message' + JSON.stringify(message));
    switch (message.type) {
      case MessageType.QUERY_LATEST:
        write(ws, responseLatestMsg());
        break;
      case MessageType.QUERY_ALL:
        write(ws, responseChainMsg());
        break;
      case MessageType.RESPONSE_BLOCKCHAIN:
        handleBlockchainResponse(message);
        break;
  }
});

const initErrorHandler = (ws) => {
  var closeConnection = (ws) => {
    console.log('Connection failed to peer: ' + ws.url);
    sockets.splice(sockets.indexOf(ws), 1);
  };
  ws.on('close', () => closeConnection(ws));
  ws.on('error', () => closeConnection(ws));
};

const initConnection = (ws) => {
  sockets.push(ws);
  initMessageHandler(ws);
  initErrorHandler(ws);
  write(ws, queryChainLengthMsg());
};

const initP2PServer = () => {
  const server = new WebSocket.Server({
    port: p2p_port,
  });
  server.on('connection', ws => initConnection(ws));
  console.log('Listening to websocket on port ' + p2p_port);
};

const connectToPeers = (newPeers) => {
  newPeers.forEach((peer) => {
    const ws = new WebSocket(peer);
    ws.on('open', () => initConnection(ws));
    ws.on('error', () => {
      console.log('connection failed')
    });
  });
};

initExpressServer();