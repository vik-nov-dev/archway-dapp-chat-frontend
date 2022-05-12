import React, { Component } from 'react';
import { Helmet } from 'react-helmet'
import logo from './logo.svg';
import './bootstrap.min.css';
import './App.css';

import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { calculateFee, GasPrice } from "@cosmjs/stargate";
import { ChainInfo } from './chain.info.torii';

const RPC = ChainInfo.rpc;
const ContractAddress = process.env.REACT_APP_CONTRACT_ADDRESS;

export default class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      contract: ContractAddress,
      chat: {
        messages: []
      },
      cwClient: null,
      offlineSigner: null,
      chainMeta: ChainInfo,
      gasPrice: null,
      queryHandler: null,
      loadingStatus: false,
      loadingMsg: "",
      logs: [],
      rpc: RPC,
      accounts: null,
      userAddress: null
    };
  };

  /**
   * Instances basic settings
   * @see {File} ./.env
   * @see {File} ./env.example
   * @see https://create-react-app.dev/docs/adding-custom-environment-variables/
   */
   connectWallet = async () => {
    console.log('Connecting wallet...');
      try {
        if (window) {
          if (window['keplr']) {
            if (window.keplr['experimentalSuggestChain']) {
              await window.keplr.experimentalSuggestChain(this.state.chainMeta)
              await window.keplr.enable(this.state.chainMeta.chainId);              
              let offlineSigner = await window.getOfflineSigner(this.state.chainMeta.chainId);
              console.log('offlineSigner', offlineSigner);
              let cwClient = await SigningCosmWasmClient.connectWithSigner(this.state.rpc, offlineSigner);
              let accounts = await offlineSigner.getAccounts();
              let queryHandler = cwClient.queryClient.wasm.queryContractSmart;
              let gasPrice = GasPrice.fromString('0.002utorii');
              let userAddress = accounts[0].address;

              // Update state
              this.setState({
                accounts: accounts,
                userAddress: userAddress,
                cwClient: cwClient,
                queryHandler: queryHandler,
                gasPrice: gasPrice,
                offlineSigner: offlineSigner
              });

              // Debug
              console.log('dApp Connected', {
                accounts: this.state.accounts,
                userAddress: this.state.userAddress,
                client: this.state.cwClient,
                queryHandler: this.state.queryHandler,
                gasPrice: this.state.gasPrice,
                offlineSigner: this.state.offlineSigner
              });

              // Get the Chat
              let chat = await this.getChat();
              // console.log(chat.messages)
              try {
                if (chat.messages.length) {
                  this.setState({ chat: chat });
                } else {
                  console.warn('Error expected not empty chat, got: ', typeof chat);
                }
              } catch (e) {
                console.warn('Error: failed getting chat', e);
              }
            } else {
              console.warn('Error access experimental features, please update Keplr');
            }
          } else {
            console.warn('Error accessing Keplr');
          }
        } else {
          console.warn('Error parsing window object');
        }
      } catch (e) {
        console.error('Error connecting to wallet', e);
      }
  }

  /**
   * Query contract chat
   * @see {SigningCosmWasmClient}
   * @see https://github.com/drewstaylor/archway-template/blob/main/src/contract.rs#L66-L71
   */
   getChat = async () => {
    // SigningCosmWasmClient.query: async (address, query)
    let loading;
    loading = {
      status: true,
      msg: "Refreshing chat..."
    };
    this.setState({
      loadingStatus: loading.status,
      loadingMsg: loading.msg
    });
    let entrypoint = {
      get_messages: {}
    };
    let query = await this.state.queryHandler(this.state.contract, entrypoint);
    loading = {
      status: false,
      msg: ""
    };
    this.setState({
      chat: query,
      loadingStatus: loading.status,
      loadingMsg: loading.msg
    });
    console.log('Chat Queried', query);
    return query;
  }

  /**
   * Increment the counter
   * @see {SigningCosmWasmClient}
   * @see https://github.com/drewstaylor/archway-template/blob/main/src/contract.rs#L42
   */
  postMessage = async (event) => {
    event.preventDefault();
    // SigningCosmWasmClient.execute: async (senderAddress, contractAddress, msg, fee, memo = "", funds)
    if (!this.state.accounts) {
      console.warn('Error getting accounts', this.state.accounts);
      return;
    } else if (!this.state.userAddress) {
      console.warn('Error getting user address', this.state.userAddress);
      return;
    }
    let loading;
    loading = {
      status: true,
      msg: "Posting your message..."
    };
    this.setState({ 
      loadingStatus: loading.status,
      loadingMsg: loading.msg
    });
    // Prepare Tx
    let entrypoint = {
      post_message: {
        message: event.target.message.value,
        moniker: event.target.moniker.value,
      }
    };
    event.target.message.value = '';
    console.log(entrypoint);
    let txFee = calculateFee(300000, this.state.gasPrice); // XXX TODO: Fix gas estimation (https://github.com/cosmos/cosmjs/issues/828)
    console.log('Tx args', {
      senderAddress: this.state.userAddress, 
      contractAddress: this.state.contract, 
      msg: entrypoint, 
      fee: txFee
    });
    // Send Tx
    try {
      let tx = await this.state.cwClient.execute(this.state.userAddress, this.state.contract, entrypoint, txFee);
      console.log('PostMessage Tx', tx);
      // Update Logs
      if (tx.logs) {
        if (tx.logs.length) {
          tx.logs[0].type = 'post_message';
          tx.logs[0].timestamp = new Date().getTime();
          this.setState({
            logs: [JSON.stringify(tx.logs, null, 2), ...this.state.logs]
          });
        }
      }
      // Refresh chat
      let chat = await this.getChat();
      if (!chat.messages.length) {
        chat = this.state.chat;
        console.warn('Error expected not empty chat, got: ', typeof chat);
      }
      // Render updates
      loading = {
        status: false,
        msg: ""
      };
      this.setState({
        //chat: chat,
        loadingStatus: loading.status,
        loadingMsg: loading.msg
      });
    } catch (e) {
      console.warn('Error exceuting Increment', e);
      loading = {
        status: false,
        msg: ""
      };
      this.setState({
        loadingStatus: loading.status,
        loadingMsg: loading.msg
      });
    }
  }

  render() {
    // State
    const chat = this.state.chat;
    const loadingMsg = this.state.loadingMsg;
    const userAddress = this.state.userAddress;

    // Maps
    let logMeta = [];
    for (let i = 0; i < this.state.logs.length; i++) {
      let logItem = JSON.parse(this.state.logs[i]);
      let meta = {
        type: logItem[0].type,
        timestamp: logItem[0].timestamp
      };
      logMeta.push(meta);
    }
    const logItems = (this.state.logs.length) ? this.state.logs.map((log, i) =>
      <div key={logMeta[i].timestamp}>
        <p className="label">
          <strong><span>Logs {(logMeta[i].type === 'post_message') ? 'PostMessage' : 'Other' }&nbsp;</span>({logMeta[i].timestamp}):</strong>
        </p>
        <pre className="log-entry" key={"log-" + i}>{log}</pre>
      </div>
    ) : null;

    // Not Connected
    if (!userAddress) {
      return (
        <div className="content">
          <Helmet>
            <title>Archway Chat | Not Connected</title>
            <meta name="description" content="Simple Archway chat by VikNov" />
          </Helmet>
          <h1>
            <img src={logo} alt="logo" />
            Chat
          </h1>
          <div className="button-controls">
            <button id="connect" className="btn btn-success mt-5" onClick={this.connectWallet}>Connect Keplr Wallet to use the Chat</button>
          </div>

        </div>
      );
    }

    // Connected
    return (
      <div className="container">
        <Helmet>
          <title>Archway Chat</title>
          <meta name="description" content="Simple Archway chat by VikNov" />
        </Helmet>
        <div className="row">
          <div className="col-12">
            <h1 className="mb-5">
              <img src={logo} alt="logo" />
              Chat
            </h1>
          </div>
        </div>
        <div className="row justify-content-center">
          <div className="col-12 col-md-6">
            {/* Display the current chat */}
            <div className="the-chat">
              <ol className="list-group">
              {chat.messages.map((message, i) =>
                <li key={i} className={"list-group-item d-flex" + (message.address === this.state.userAddress ? ' mine' : '')}>
                  <div className="message-wrapper">
                    <div className="fw-bold">{(message.moniker.length ? message.moniker : message.address)}</div>
                    <p>{message.message}</p>
                  </div>
                </li>
              )}
              </ol>
            </div>
          </div>
        </div>
        <div className="row justify-content-center">
          <div className="col-12 col-md-6 mt-3">
            <button className="btn btn-secondary" onClick={this.getChat}>Refresh chat</button>
          </div>
        </div>
        <div className="row justify-content-center">
          <div className="col-12 col-md-6 mt-3">
            {/* Loading */}
            {Loading(loadingMsg)}
          </div>
        </div>
        <div className="row justify-content-center">
          <div className="col-12 col-md-6">
            {/* Controls */}
            <form onSubmit={this.postMessage}>
            <div className="mb-3">
                <label htmlFor="moniker" className="form-label">Your moniker (optional)</label>
                <input type="text" className="form-control" id="moniker" />
              </div>
              <div className="mb-3">
                <label htmlFor="message" className="form-label">Your message</label>
                <textarea className="form-control" id="message" rows="3" required></textarea>
              </div>
              <button type="submit" className="btn btn-primary">Post message</button>
            </form>

            {/* Logs map */}
            <div className="logs">
              <div>{logItems}</div>
            </div>

          </div>
        </div>
      </div>
    );
  };

}

// Conditional rendering
function Loading(msg) {
  if (!msg) {
    return;
  }
  return (
    <div className="alert alert-success" role="alert">
      {msg}
    </div>
  );
}