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

    struct SellOffer {
        uint id;
        address seller;
        uint energy;
        uint price;
        bool active;
        string sellerName;
    }

    SellOffer[] public sellOffers;

    event SellOfferCreated(uint id, address indexed seller, uint energy, uint price);

    function postSellOffer(uint energy, uint price) external returns (uint) {
        require(users[msg.sender].registered, "User not registered");
        require(energy > 0, "Energy must be > 0");
        require(price > 0, "Price must be > 0");

        uint id = sellOffers.length;

        sellOffers.push(SellOffer({
            id: id,
            seller: msg.sender,
            energy: energy,
            price: price,
            active: true,
            sellerName: users[msg.sender].name
        }));

        emit SellOfferCreated(id, msg.sender, energy, price);
        return id;
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

        require(offer.active, "Sell offer not active");
        require(request.active, "Buy request not active");
        require(offer.energy >= request.energyNeeded, "Not enough energy in offer");
        require(offer.price <= request.maxPrice, "Offer price too high");

        _executeTrade(offer, request);
    }

    // Walks active buy requests in posting order and matches each against the
    // oldest active offer that fits, settling as many trades as possible in one call.
    function autoMatch() external returns (uint matchesExecuted) {
        for (uint i = 0; i < buyRequests.length; i++) {
            BuyRequest storage request = buyRequests[i];
            if (!request.active) {
                continue;
            }

            for (uint j = 0; j < sellOffers.length; j++) {
                SellOffer storage offer = sellOffers[j];
                if (!offer.active) {
                    continue;
                }

                if (offer.energy >= request.energyNeeded && offer.price <= request.maxPrice) {
                    _executeTrade(offer, request);
                    matchesExecuted++;
                    break;
                }
            }
        }

        emit AutoMatchCompleted(matchesExecuted);
    }

    function _executeTrade(SellOffer storage offer, BuyRequest storage request) private {
        uint totalCost = request.energyNeeded * offer.price;
        uint escrowed = request.energyNeeded * request.maxPrice;
        uint refund = escrowed - totalCost;

        uint tradeId = trades.length;

        trades.push(Trade({
            id: tradeId,
            seller: offer.seller,
            buyer: request.buyer,
            energy: request.energyNeeded,
            price: offer.price,
            timestamp: block.timestamp,
            sellerName: offer.sellerName,
            buyerName: request.buyerName
        }));

        offer.energy -= request.energyNeeded;
        if (offer.energy == 0) {
            offer.active = false;
        }

        request.active = false;

        (bool sellerPaid, ) = payable(offer.seller).call{value: totalCost}("");
        require(sellerPaid, "Payment to seller failed");

        if (refund > 0) {
            (bool buyerRefunded, ) = payable(request.buyer).call{value: refund}("");
            require(buyerRefunded, "Refund to buyer failed");
        }

        emit TradeExecuted(tradeId, offer.seller, request.buyer, request.energyNeeded, offer.price, block.timestamp);
    }

    function getActiveOffers() external view returns (SellOffer[] memory) {
        uint count = 0;
        for (uint i = 0; i < sellOffers.length; i++) {
            if (sellOffers[i].active) {
                count++;
            }
        }

        SellOffer[] memory active = new SellOffer[](count);
        uint index = 0;
        for (uint i = 0; i < sellOffers.length; i++) {
            if (sellOffers[i].active) {
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
