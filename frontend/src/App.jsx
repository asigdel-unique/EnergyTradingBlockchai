import { useState, useEffect } from "react";
import { ethers } from "ethers";
import EnergyMarketplaceABI from "./EnergyMarketplaceABI.json";
import "./App.css";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [status, setStatus] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [nameMap, setNameMap] = useState({});

  const [sellEnergy, setSellEnergy] = useState("");
  const [sellPrice, setSellPrice] = useState("");

  const [buyEnergy, setBuyEnergy] = useState("");
  const [buyMaxPrice, setBuyMaxPrice] = useState("");

  const [activeOffers, setActiveOffers] = useState([]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [trades, setTrades] = useState([]);

  function displayName(address) {
    return nameMap[address.toLowerCase()] || `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  async function resolveNames(addresses) {
    if (!contract) return;
    const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter((a) => !(a in nameMap));
    if (unique.length === 0) return;

    const entries = await Promise.all(
      unique.map(async (addr) => {
        try {
          const user = await contract.users(addr);
          const label = user.registered && user.name ? user.name : `${addr.slice(0, 6)}...${addr.slice(-4)}`;
          return [addr, label];
        } catch {
          return [addr, `${addr.slice(0, 6)}...${addr.slice(-4)}`];
        }
      })
    );

    setNameMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus("MetaMask not found. Please install it.");
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const marketplace = new ethers.Contract(CONTRACT_ADDRESS, EnergyMarketplaceABI, signer);

      setAccount(address);
      setContract(marketplace);
      setStatus("Wallet connected: " + address);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  function disconnectWallet() {
    setAccount(null);
    setContract(null);
    setActiveOffers([]);
    setActiveRequests([]);
    setTrades([]);
    setStatus("Disconnected.");
  }

  useEffect(() => {
    if (!contract) return;

    loadMarketplace();

    const handleTrade = () => {
      loadMarketplace();
    };
    contract.on("TradeExecuted", handleTrade);
    return () => {
      contract.off("TradeExecuted", handleTrade);
    };
  }, [contract]);

  async function registerUser() {
    if (!contract || !registerName.trim()) return;
    try {
      setStatus("Registering...");
      const tx = await contract.registerUser(registerName.trim());
      await tx.wait();
      setNameMap((prev) => ({ ...prev, [account.toLowerCase()]: registerName.trim() }));
      setStatus(`Registered as "${registerName.trim()}"!`);
      setRegisterName("");
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function postSellOffer() {
    if (!contract) return;
    try {
      setStatus("Posting sell offer...");
      const priceWei = ethers.parseEther(sellPrice);
      const tx = await contract.postSellOffer(sellEnergy, priceWei);
      await tx.wait();
      setStatus(`Sell offer posted: ${sellEnergy} kWh at ${sellPrice} ETH/kWh`);
      setSellEnergy("");
      setSellPrice("");
      loadMarketplace();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function postBuyRequest() {
    if (!contract) return;
    try {
      setStatus("Posting buy request...");
      const maxPriceWei = ethers.parseEther(buyMaxPrice);
      const escrowAmount = BigInt(buyEnergy) * maxPriceWei;

      const tx = await contract.postBuyRequest(buyEnergy, maxPriceWei, {
        value: escrowAmount,
      });
      await tx.wait();
      setStatus(`Buy request posted: ${buyEnergy} kWh, max ${buyMaxPrice} ETH/kWh (escrowed ${ethers.formatEther(escrowAmount)} ETH)`);
      setBuyEnergy("");
      setBuyMaxPrice("");
      loadMarketplace();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function loadMarketplace() {
    if (!contract) return;
    try {
      const offers = await contract.getActiveOffers();
      const requests = await contract.getActiveRequests();
      const allTrades = await contract.getAllTrades();

      await resolveNames([
        ...offers.map((o) => o.seller),
        ...requests.map((r) => r.buyer),
        ...allTrades.flatMap((t) => [t.seller, t.buyer]),
      ]);

      setActiveOffers(offers);
      setActiveRequests(requests);
      setTrades(allTrades);
    } catch (err) {
      setStatus("Error loading marketplace: " + (err.reason || err.message));
    }
  }

  async function autoMatch() {
    if (!contract) return;
    try {
      setStatus("Running automatic matching...");
      const tx = await contract.autoMatch();
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "AutoMatchCompleted");

      const matchesExecuted = event ? event.args.matchesExecuted.toString() : "?";
      setStatus(`Auto-matching complete: ${matchesExecuted} trade(s) executed.`);
      loadMarketplace();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Energy Marketplace</h1>
        {account ? (
          <div className="wallet-controls">
            <div className="wallet-badge">{displayName(account)}</div>
            <button className="btn btn-secondary" onClick={disconnectWallet}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={connectWallet}>
            Connect Wallet
          </button>
        )}
      </header>

      <main className="container">
        {!account ? (
          <div className="panel empty-state">
            <p>Connect your wallet to start trading energy.</p>
          </div>
        ) : (
          <>
            <section className="panel">
              <h2>Your Profile</h2>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Display name, e.g. Solar House A"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                />
                <button className="btn btn-primary" onClick={registerUser}>
                  Register as User
                </button>
              </div>
            </section>

            <div className="panel-grid">
              <section className="panel">
                <h2>Post Sell Offer</h2>
                <div className="form-row">
                  <input
                    type="number"
                    placeholder="Energy (kWh)"
                    value={sellEnergy}
                    onChange={(e) => setSellEnergy(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Price per kWh (ETH)"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={postSellOffer}>
                    Post Sell Offer
                  </button>
                </div>
              </section>

              <section className="panel">
                <h2>Post Buy Request</h2>
                <div className="form-row">
                  <input
                    type="number"
                    placeholder="Energy needed (kWh)"
                    value={buyEnergy}
                    onChange={(e) => setBuyEnergy(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Max price per kWh (ETH)"
                    value={buyMaxPrice}
                    onChange={(e) => setBuyMaxPrice(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={postBuyRequest}>
                    Post Buy Request
                  </button>
                </div>
              </section>
            </div>

            <section className="panel">
              <div className="panel-header">
                <h2>Marketplace</h2>
                <button className="btn btn-secondary" onClick={loadMarketplace}>
                  Refresh
                </button>
              </div>

              <h3>Active Sell Offers</h3>
              {activeOffers.length === 0 ? (
                <p className="empty-row">No active offers.</p>
              ) : (
                <div className="card-grid">
                  {activeOffers.map((o) => (
                    <div key={o.id.toString()} className="card card-offer">
                      <div className="card-title">{displayName(o.seller)}</div>
                      <p className="card-line">{o.energy.toString()} kWh</p>
                      <p className="card-line card-sub">{ethers.formatEther(o.price)} ETH/kWh</p>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="section-gap">Active Buy Requests</h3>
              {activeRequests.length === 0 ? (
                <p className="empty-row">No active requests.</p>
              ) : (
                <div className="card-grid">
                  {activeRequests.map((r) => (
                    <div key={r.id.toString()} className="card card-request">
                      <div className="card-title">{displayName(r.buyer)}</div>
                      <p className="card-line">{r.energyNeeded.toString()} kWh needed</p>
                      <p className="card-line card-sub">up to {ethers.formatEther(r.maxPrice)} ETH/kWh</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <h2>Automatic Matching</h2>
              <p className="muted">
                The contract scans all active buy requests and settles every trade it can find — no manual ID entry needed.
              </p>
              <button className="btn btn-primary" onClick={autoMatch}>
                Run Matching
              </button>
            </section>

            <section className="panel">
              <h2>Trade History</h2>
              {trades.length === 0 ? (
                <p className="empty-row">No trades yet.</p>
              ) : (
                <div className="card-grid">
                  {trades.map((t) => (
                    <div key={t.id.toString()} className="card card-trade">
                      <div className="card-title">
                        {displayName(t.seller)} → {displayName(t.buyer)}
                      </div>
                      <p className="card-line">
                        {t.energy.toString()} kWh @ {ethers.formatEther(t.price)} ETH/kWh
                      </p>
                      <p className="card-line card-sub">{new Date(Number(t.timestamp) * 1000).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {status && (
        <div className={`status-banner ${status.startsWith("Error") ? "status-error" : "status-success"}`}>
          {status}
        </div>
      )}
    </div>
  );
}

export default App;
