// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract EnergyMarketplace {

    struct User {
        address wallet;
        string name;
        bool registered;
    }

    mapping(address => User) public users;

    event UserRegistered(address indexed wallet, string name);
    event UserRenamed(address indexed wallet, string name);

    function registerUser(string memory name) external {
        require(!users[msg.sender].registered, "Already registered");
        require(bytes(name).length > 0, "Name required");

        users[msg.sender] = User({
            wallet: msg.sender,
            name: name,
            registered: true
        });

        emit UserRegistered(msg.sender, name);
    }

    function updateName(string memory name) external {
        require(users[msg.sender].registered, "Not registered");
        require(bytes(name).length > 0, "Name required");

        users[msg.sender].name = name;

        emit UserRenamed(msg.sender, name);
    }

    uint public constant OFFER_EXPIRY_DURATION = 3 minutes;

    struct SellOffer {
        uint id;
        address seller;
        uint energy;
        uint price;
        bool active;
        string sellerName;
        uint expiresAt;
    }

    SellOffer[] public sellOffers;

    event SellOfferCreated(uint id, address indexed seller, uint energy, uint price, uint expiresAt);

    function postSellOffer(uint energy, uint price) external returns (uint) {
        require(users[msg.sender].registered, "User not registered");
        require(energy > 0, "Energy must be > 0");
        require(price > 0, "Price must be > 0");

        uint id = sellOffers.length;
        uint expiresAt = block.timestamp + OFFER_EXPIRY_DURATION;

        sellOffers.push(SellOffer({
            id: id,
            seller: msg.sender,
            energy: energy,
            price: price,
            active: true,
            sellerName: users[msg.sender].name,
            expiresAt: expiresAt
        }));

        emit SellOfferCreated(id, msg.sender, energy, price, expiresAt);
        return id;
    }

    function _isOfferLive(SellOffer storage offer) private view returns (bool) {
        return offer.active && block.timestamp < offer.expiresAt;
    }

    struct BuyRequest {
        uint id;
        address buyer;
        uint energyNeeded;
        uint maxPrice;
        bool active;
        string buyerName;
    }

    BuyRequest[] public buyRequests;

    event BuyRequestCreated(uint id, address indexed buyer, uint energyNeeded, uint maxPrice);

    function postBuyRequest(uint energyNeeded, uint maxPrice) external payable returns (uint) {
        require(users[msg.sender].registered, "User not registered");
        require(energyNeeded > 0, "Energy needed must be > 0");
        require(maxPrice > 0, "Max price must be > 0");
        require(msg.value == energyNeeded * maxPrice, "Must escrow exact total (energyNeeded * maxPrice)");

        uint id = buyRequests.length;

        buyRequests.push(BuyRequest({
            id: id,
            buyer: msg.sender,
            energyNeeded: energyNeeded,
            maxPrice: maxPrice,
            active: true,
            buyerName: users[msg.sender].name
        }));

        emit BuyRequestCreated(id, msg.sender, energyNeeded, maxPrice);
        return id;
    }

    struct Trade {
        uint id;
        address seller;
        address buyer;
        uint energy;
        uint price;
        uint timestamp;
        string sellerName;
        string buyerName;
    }

    Trade[] public trades;

    event TradeExecuted(uint id, address indexed seller, address indexed buyer, uint energy, uint price, uint timestamp);
    event AutoMatchCompleted(uint matchesExecuted);

    function matchTrade(uint sellOfferId, uint buyRequestId) external {
        SellOffer storage offer = sellOffers[sellOfferId];
        BuyRequest storage request = buyRequests[buyRequestId];

        require(_isOfferLive(offer), "Sell offer not active or expired");
        require(request.active, "Buy request not active");
        require(offer.price <= request.maxPrice, "Offer price too high");

        uint energy = offer.energy < request.energyNeeded ? offer.energy : request.energyNeeded;
        _executeTrade(offer, request, energy);
    }

    // For each active buy request (oldest first), checks whether enough
    // affordable supply exists to cover it completely; if so, prefers a
    // single active offer that alone covers the full amount (cheapest such
    // offer), and only splits across multiple offers, cheapest first, when
    // no single offer is big enough. Requests that can't be fully covered
    // yet are left untouched rather than partially filled.
    function autoMatch() external returns (uint matchesExecuted) {
        for (uint i = 0; i < buyRequests.length; i++) {
            BuyRequest storage request = buyRequests[i];
            if (!request.active) {
                continue;
            }

            if (_affordableSupply(request.maxPrice) < request.energyNeeded) {
                continue;
            }

            uint fullCoverIndex = _cheapestFullyCoveringOffer(request.maxPrice, request.energyNeeded);
            if (fullCoverIndex != type(uint).max) {
                _executeTrade(sellOffers[fullCoverIndex], request, request.energyNeeded);
                matchesExecuted++;
                continue;
            }

            while (request.active) {
                uint cheapestIndex = type(uint).max;
                uint cheapestPrice = type(uint).max;

                for (uint j = 0; j < sellOffers.length; j++) {
                    SellOffer storage offer = sellOffers[j];
                    if (!_isOfferLive(offer) || offer.price > request.maxPrice) {
                        continue;
                    }
                    if (offer.price < cheapestPrice) {
                        cheapestPrice = offer.price;
                        cheapestIndex = j;
                    }
                }

                if (cheapestIndex == type(uint).max) {
                    break;
                }

                SellOffer storage cheapestOffer = sellOffers[cheapestIndex];
                uint energy = cheapestOffer.energy < request.energyNeeded
                    ? cheapestOffer.energy
                    : request.energyNeeded;

                _executeTrade(cheapestOffer, request, energy);
                matchesExecuted++;
            }
        }

        emit AutoMatchCompleted(matchesExecuted);
    }

    function _cheapestFullyCoveringOffer(uint maxPrice, uint energyNeeded) private view returns (uint bestIndex) {
        bestIndex = type(uint).max;
        uint bestPrice = type(uint).max;

        for (uint j = 0; j < sellOffers.length; j++) {
            SellOffer storage offer = sellOffers[j];
            if (!_isOfferLive(offer) || offer.price > maxPrice || offer.energy < energyNeeded) {
                continue;
            }
            if (offer.price < bestPrice) {
                bestPrice = offer.price;
                bestIndex = j;
            }
        }
    }

    function _affordableSupply(uint maxPrice) private view returns (uint total) {
        for (uint j = 0; j < sellOffers.length; j++) {
            SellOffer storage offer = sellOffers[j];
            if (_isOfferLive(offer) && offer.price <= maxPrice) {
                total += offer.energy;
            }
        }
    }

    function _executeTrade(SellOffer storage offer, BuyRequest storage request, uint energy) private {
        uint totalCost = energy * offer.price;
        uint escrowed = energy * request.maxPrice;
        uint refund = escrowed - totalCost;

        uint tradeId = trades.length;

        trades.push(Trade({
            id: tradeId,
            seller: offer.seller,
            buyer: request.buyer,
            energy: energy,
            price: offer.price,
            timestamp: block.timestamp,
            sellerName: offer.sellerName,
            buyerName: request.buyerName
        }));

        offer.energy -= energy;
        if (offer.energy == 0) {
            offer.active = false;
        }

        request.energyNeeded -= energy;
        if (request.energyNeeded == 0) {
            request.active = false;
        }

        (bool sellerPaid, ) = payable(offer.seller).call{value: totalCost}("");
        require(sellerPaid, "Payment to seller failed");

        if (refund > 0) {
            (bool buyerRefunded, ) = payable(request.buyer).call{value: refund}("");
            require(buyerRefunded, "Refund to buyer failed");
        }

        emit TradeExecuted(tradeId, offer.seller, request.buyer, energy, offer.price, block.timestamp);
    }

    function getActiveOffers() external view returns (SellOffer[] memory) {
        uint count = 0;
        for (uint i = 0; i < sellOffers.length; i++) {
            if (_isOfferLive(sellOffers[i])) {
                count++;
            }
        }

        SellOffer[] memory active = new SellOffer[](count);
        uint index = 0;
        for (uint i = 0; i < sellOffers.length; i++) {
            if (_isOfferLive(sellOffers[i])) {
                active[index] = sellOffers[i];
                index++;
            }
        }

        return active;
    }

    function getActiveRequests() external view returns (BuyRequest[] memory) {
        uint count = 0;
        for (uint i = 0; i < buyRequests.length; i++) {
            if (buyRequests[i].active) {
                count++;
            }
        }

        BuyRequest[] memory active = new BuyRequest[](count);
        uint index = 0;
        for (uint i = 0; i < buyRequests.length; i++) {
            if (buyRequests[i].active) {
                active[index] = buyRequests[i];
                index++;
            }
        }

        return active;
    }

    function getAllTrades() external view returns (Trade[] memory) {
        return trades;
    }

}
