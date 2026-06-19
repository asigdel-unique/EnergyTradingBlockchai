// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {EnergyMarketplace} from "./EnergyMarketplace.sol";

contract EnergyMarketplaceTest is Test {
    EnergyMarketplace market;

    address seller = makeAddr("seller");
    address seller2 = makeAddr("seller2");
    address buyer = makeAddr("buyer");

    function setUp() public {
        market = new EnergyMarketplace();
        vm.deal(buyer, 100 ether);

        vm.prank(seller);
        market.registerUser("Solar House A");

        vm.prank(seller2);
        market.registerUser("Solar House B");

        vm.prank(buyer);
        market.registerUser("Buyer One");
    }

    function test_AutoMatchSettlesFullyCoveredRequest() public {
        vm.prank(seller);
        market.postSellOffer(10, 100);

        uint escrow = 10 * 200;
        vm.prank(buyer);
        market.postBuyRequest{value: escrow}(10, 200);

        uint matches = market.autoMatch();
        require(matches == 1, "Expected exactly one match");

        (, address tradeSeller, address tradeBuyer, uint energy, uint price, uint timestamp) = market.trades(0);
        require(tradeSeller == seller, "Trade should record the seller");
        require(tradeBuyer == buyer, "Trade should record the buyer");
        require(energy == 10, "Trade should move the full requested energy");
        require(price == 100, "Trade should settle at the offer price");
        require(timestamp == block.timestamp, "Trade should record the execution timestamp");

        require(seller.balance == 1000, "Seller should receive energy * offer price");
        require(buyer.balance == 100 ether - escrow + 1000, "Buyer should be refunded the price spread");
    }

    function test_AutoMatchPicksFirstFittingOfferNotCheapest() public {
        vm.prank(seller);
        market.postSellOffer(5, 200);

        vm.prank(seller2);
        market.postSellOffer(5, 100);

        uint escrow = 5 * 300;
        vm.prank(buyer);
        market.postBuyRequest{value: escrow}(5, 300);

        market.autoMatch();

        (, address tradeSeller, , , uint price, ) = market.trades(0);
        require(tradeSeller == seller, "First-come policy should pick the earlier offer");
        require(price == 200, "Trade should settle at the first offer's price, not the cheapest");
    }

    function test_AutoMatchSkipsRequestsWithNoFittingOffer() public {
        vm.prank(seller);
        market.postSellOffer(5, 500);

        uint escrow = 5 * 100;
        vm.prank(buyer);
        market.postBuyRequest{value: escrow}(5, 100);

        uint matches = market.autoMatch();
        require(matches == 0, "Offer price exceeds max price, so no match should occur");

        EnergyMarketplace.BuyRequest[] memory active = market.getActiveRequests();
        require(active.length == 1, "Unmatched request should remain active");
    }
}
