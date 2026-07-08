import { useState, useEffect } from "react";
import { ethers } from "ethers";
import EnergyMarketplaceABI from "./EnergyMarketplaceABI.json";
import "./App.css";

const CONTRACT_ADDRESS = "0x89f4E4Aa681E96Adf88524BD01783cF591f4fc2C";
const LOG_CHUNK_SIZE = 9000;

async function queryFilterPaginated(contract, filter) {
  const provider = contract.runner?.provider ?? contract.provider;
  const latest = await provider.getBlockNumber();
  const events = [];
  for (let from = 0; from <= latest; from += LOG_CHUNK_SIZE) {
    const to = Math.min(from + LOG_CHUNK_SIZE - 1, latest);
    const chunk = await contract.queryFilter(filter, from, to);
    events.push(...chunk);
  }
  return events;
}

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [status, setStatus] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [nameMap, setNameMap] = useState({});
  const [isRegistered, setIsRegistered] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRegisteringTx, setIsRegisteringTx] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const [sellEnergy, setSellEnergy] = useState("");
  const [sellPrice, setSellPrice] = useState("");

  const [buyEnergy, setBuyEnergy] = useState("");
  const [buyMaxPrice, setBuyMaxPrice] = useState("");

  const [activeOffers, setActiveOffers] = useState([]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [trades, setTrades] = useState([]);
  const [balance, setBalance] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  async function refreshBalance(address) {
    if (!window.ethereum || !address) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const balanceWei = await provider.getBalance(address);
      setBalance(ethers.formatEther(balanceWei));
    } catch {
      // balance display is best-effort; ignore failures
    }
  }

  function displayName(address) {
    return nameMap[address.toLowerCase()] || `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  async function resolveNames(addresses) {
    if (!contract) return;
    const validAddresses = addresses.filter((a) => typeof a === "string");
    const unique = [...new Set(validAddresses.map((a) => a.toLowerCase()))].filter((a) => !(a in nameMap));
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

  async function checkRegistration(address, marketplace) {
    setCheckingRegistration(true);
    try {
      const user = await marketplace.users(address);
      if (user.registered) {
        setNameMap((prev) => ({ ...prev, [address.toLowerCase()]: user.name }));
        setIsRegistered(true);
        setStatus(`Welcome back, ${user.name}!`);
      } else {
        setIsRegistered(false);
        setStatus("Wallet connected. Register a profile name to continue.");
      }
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setCheckingRegistration(false);
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus("MetaMask not found. Please install it.");
      return;
    }

    setIsConnecting(true);
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
      await refreshBalance(address);
      await checkRegistration(address, marketplace);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsConnecting(false);
    }
  }

  function disconnectWallet() {
    setAccount(null);
    setContract(null);
    setIsRegistered(false);
    setActiveOffers([]);
    setActiveRequests([]);
    setTrades([]);
    setBalance(null);
    setStatus("Disconnected.");
  }

  useEffect(() => {
    if (!contract) return;

    loadMarketplace();

    const handleTrade = () => {
      loadMarketplace();
    };
    contract.on("TradeExecuted", handleTrade);

    // Offers expire purely by elapsed time, so poll periodically to drop
    // expired ones from the list even without a new transaction.
    const refreshInterval = setInterval(loadMarketplace, 15000);

    return () => {
      contract.off("TradeExecuted", handleTrade);
      clearInterval(refreshInterval);
    };
  }, [contract]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const visibleOffers = activeOffers.filter((o) => Number(o.expiresAt) * 1000 > now);

  function formatTimeLeft(expiresAt) {
    const msLeft = Number(expiresAt) * 1000 - now;
    if (msLeft <= 0) return "Expired";
    const totalSeconds = Math.ceil(msLeft / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `Expires in ${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  async function registerUser() {
    if (!contract || !registerName.trim()) return;
    setIsRegisteringTx(true);
    try {
      setStatus("Registering...");
      const tx = await contract.registerUser(registerName.trim());
      await tx.wait();
      setNameMap((prev) => ({ ...prev, [account.toLowerCase()]: registerName.trim() }));
      setIsRegistered(true);
      setStatus(`Welcome, ${registerName.trim()}!`);
      setRegisterName("");
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsRegisteringTx(false);
    }
  }

  async function updateName() {
    if (!contract || !newName.trim()) return;
    setIsUpdatingName(true);
    try {
      setStatus("Updating name...");
      const tx = await contract.updateName(newName.trim());
      await tx.wait();
      setNameMap((prev) => ({ ...prev, [account.toLowerCase()]: newName.trim() }));
      setStatus(`Name updated to "${newName.trim()}"!`);
      setNewName("");
      setEditingName(false);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsUpdatingName(false);
    }
  }

  async function postSellOffer() {
    if (!contract) return;
    try {
      setStatus("Posting sell offer...");
      const priceWei = ethers.parseEther(sellPrice);
      const tx = await contract.postSellOffer(sellEnergy, priceWei);
      await tx.wait();
      setSellEnergy("");
      setSellPrice("");
      await autoMatch();
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
      setBuyEnergy("");
      setBuyMaxPrice("");
      await autoMatch();
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
      const tradeEvents = await queryFilterPaginated(contract, contract.filters.TradeExecuted());

      await resolveNames([
        ...offers.map((o) => o.seller),
        ...requests.map((r) => r.buyer),
        ...allTrades.flatMap((t) => [t.seller, t.buyer]),
      ]);

      const tradesWithTx = allTrades.map((t, i) => ({
        id: t.id,
        seller: t.seller,
        buyer: t.buyer,
        energy: t.energy,
        price: t.price,
        timestamp: t.timestamp,
        sellerName: t.sellerName,
        buyerName: t.buyerName,
        txHash: tradeEvents[i] ? tradeEvents[i].transactionHash : null,
        blockNumber: tradeEvents[i] ? tradeEvents[i].blockNumber : null,
      }));

      setActiveOffers(offers);
      setActiveRequests(requests);
      setTrades(tradesWithTx);
      await refreshBalance(account);
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
        <h1>AA Smart Energy Exchange</h1>
        {account ? (
          <div className="wallet-controls">
            <div className="wallet-badge">
              <div className="wallet-name">👤 {displayName(account)}</div>
              <div className="wallet-address">
                {account.slice(0, 6)}...{account.slice(-4)}
              </div>
              {balance !== null && <div className="wallet-balance">{Number(balance).toFixed(4)} ETH</div>}
            </div>
            <button className="btn btn-secondary" onClick={disconnectWallet}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={connectWallet} disabled={isConnecting}>
            {isConnecting && <span className="spinner" />}
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </header>

      <main className="container">
        {!account ? (
          <div className="panel landing">
            <h2>Welcome to Energy Exchange</h2>
            <p className="muted">Connect your wallet to register a new profile or access your dashboard.</p>
            <button className="btn btn-primary" onClick={connectWallet} disabled={isConnecting}>
              {isConnecting && <span className="spinner" />}
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          </div>
        ) : checkingRegistration ? (
          <div className="panel empty-state">
            <p>Checking your registration status...</p>
          </div>
        ) : !isRegistered ? (
          <div className="panel landing">
            <h2>New User Registration</h2>
            <p className="muted">Enter a display name to register your wallet and access the dashboard.</p>
            <div className="form-row">
              <input
                type="text"
                placeholder="Enter Profile Name"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
              />
              <button className="btn btn-primary" onClick={registerUser} disabled={isRegisteringTx}>
                {isRegisteringTx && <span className="spinner" />}
                {isRegisteringTx ? "Registering..." : "Register"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Active Offers</div>
                <div className="stat-value">{visibleOffers.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Active Requests</div>
                <div className="stat-value">{activeRequests.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Energy Traded</div>
                <div className="stat-value">
                  {trades.reduce((sum, t) => sum + t.energy, 0n).toString()} kWh
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total ETH Volume</div>
                <div className="stat-value">
                  {Number(
                    ethers.formatEther(trades.reduce((sum, t) => sum + t.energy * t.price, 0n))
                  ).toFixed(4)}{" "}
                  ETH
                </div>
              </div>
            </div>

            <section className="panel">
              <div className="panel-header">
                <h2>Profile</h2>
                {!editingName && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditingName(true);
                      setNewName(displayName(account));
                    }}
                  >
                    Edit Name
                  </button>
                )}
              </div>
              {editingName ? (
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="New display name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={updateName} disabled={isUpdatingName}>
                    {isUpdatingName && <span className="spinner" />}
                    {isUpdatingName ? "Saving..." : "Save"}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setEditingName(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="muted">
                  You&apos;re registered as <strong>{displayName(account)}</strong>.
                </p>
              )}
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
              {visibleOffers.length === 0 ? (
                <p className="empty-row">No active offers.</p>
              ) : (
                <div className="card-grid">
                  {visibleOffers.map((o) => {
                    const msLeft = Number(o.expiresAt) * 1000 - now;
                    return (
                      <div key={o.id.toString()} className="card card-offer">
                        <div className="card-title">{o.sellerName || displayName(o.seller)}</div>
                        <p className="card-line">{o.energy.toString()} kWh</p>
                        <p className="card-line card-sub">{ethers.formatEther(o.price)} ETH/kWh</p>
                        <p className={`card-expiry ${msLeft < 30000 ? "card-expiry-soon" : ""}`}>
                          {formatTimeLeft(o.expiresAt)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              <h3 className="section-gap">Active Buy Requests</h3>
              {activeRequests.length === 0 ? (
                <p className="empty-row">No active requests.</p>
              ) : (
                <div className="card-grid">
                  {activeRequests.map((r) => (
                    <div key={r.id.toString()} className="card card-request">
                      <div className="card-title">{r.buyerName || displayName(r.buyer)}</div>
                      <p className="card-line">{r.energyNeeded.toString()} kWh needed</p>
                      <p className="card-line card-sub">up to {ethers.formatEther(r.maxPrice)} ETH/kWh</p>
                      <p className="card-line card-sub">escrowed: {ethers.formatEther(r.energyNeeded * r.maxPrice)} ETH</p>
                    </div>
                  ))}
                </div>
              )}
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
                        {t.sellerName || displayName(t.seller)} → {t.buyerName || displayName(t.buyer)}
                      </div>
                      <p className="card-line">
                        {t.energy.toString()} kWh @ {ethers.formatEther(t.price)} ETH/kWh
                      </p>
                      <p className="card-line card-sub">paid: {ethers.formatEther(t.energy * t.price)} ETH</p>
                      <p className="card-line card-sub">{new Date(Number(t.timestamp) * 1000).toLocaleString()}</p>
                      {t.txHash && (
                        <p className="card-line card-sub">
                          tx: {t.txHash.slice(0, 10)}...{t.txHash.slice(-6)} (block {t.blockNumber})
                        </p>
                      )}
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
