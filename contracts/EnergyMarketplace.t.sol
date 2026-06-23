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

        (, address tradeSeller, address tradeBuyer, uint energy, uint price, uint timestamp, string memory sellerName, string memory buyerName) =
            market.trades(0);
        require(tradeSeller == seller, "Trade should record the seller");
        require(tradeBuyer == buyer, "Trade should record the buyer");
        require(energy == 10, "Trade should move the full requested energy");
        require(price == 100, "Trade should settle at the offer price");
        require(timestamp == block.timestamp, "Trade should record the execution timestamp");
        require(keccak256(bytes(sellerName)) == keccak256(bytes("Solar House A")), "Trade should snapshot seller name");
        require(keccak256(bytes(buyerName)) == keccak256(bytes("Buyer One")), "Trade should snapshot buyer name");

        require(seller.balance == 1000, "Seller should receive energy * offer price");
        require(buyer.balance == 100 ether - escrow + 1000, "Buyer should be refunded the price spread");
    }

    function test_AutoMatchPicksCheapestOfferNotFirstPosted() public {
        vm.prank(seller);
        market.postSellOffer(5, 200);

        vm.prank(seller2);
        market.postSellOffer(5, 100);

        uint escrow = 5 * 300;
        vm.prank(buyer);
        market.postBuyRequest{value: escrow}(5, 300);

        market.autoMatch();

        (, address tradeSeller, , , uint price, , , ) = market.trades(0);
        require(tradeSeller == seller2, "Cheapest-price policy should pick the cheaper offer even if posted later");
        require(price == 100, "Trade should settle at the cheapest fitting price");
    }

    function test_AutoMatchPrefersSingleFullyCoveringOfferOverFragmenting() public {
        vm.prank(seller);
        market.postSellOffer(14, 100);

        vm.prank(seller2);
        market.postSellOffer(20, 100);

        uint escrow = 20 * 100;
        vm.prank(buyer);
        market.postBuyRequest{value: escrow}(20, 100);

        uint matches = market.autoMatch();
        require(matches == 1, "A single offer that fully covers the request should settle in one trade");

        (, address tradeSeller, , uint energy, , , , ) = market.trades(0);
        require(tradeSeller == seller2, "The fully-covering offer should be used, not the smaller older one");
        require(energy == 20, "Trade should move the full requested energy in one shot");

        EnergyMarketplace.SellOffer[] memory offers = market.getActiveOffers();
        require(offers.length == 1, "The smaller offer should remain untouched");
        require(offers[0].seller == seller, "The untouched offer should be the smaller, older one");
        require(offers[0].energy == 14, "The untouched offer's energy should be unchanged");
    }

    function test_AutoMatchSplitsRequestAcrossMultipleSmallerOffers() public {
        vm.prank(seller);
        market.postSellOffer(5, 100);

        vm.prank(seller2);
        market.postSellOffer(5, 100);

        address seller3 = makeAddr("seller3");
        vm.prank(seller3);
        market.registerUser("Solar House C");
        vm.prank(seller3);
        market.postSellOffer(3, 100);

        uint escrow = 13 * 100;
        vm.prank(buyer);
        market.postBuyRequest{value: escrow}(13, 100);

        uint matches = market.autoMatch();
        require(matches == 3, "Request should be filled by three separate offers");

        EnergyMarketplace.BuyRequest[] memory active = market.getActiveRequests();
        require(active.length == 0, "Fully filled request should no longer be active");

        (, , , uint energy0, , , , ) = market.trades(0);
        (, , , uint energy1, , , , ) = market.trades(1);
        (, , , uint energy2, , , , ) = market.trades(2);
        require(energy0 + energy1 + energy2 == 13, "Sum of partial fills should equal the requested energy");

        require(seller.balance == 500, "Seller should be paid for its share of the request");
        require(seller2.balance == 500, "Seller2 should be paid for its share of the request");
        require(seller3.balance == 300, "Seller3 should be paid for its share of the request");
        require(buyer.balance == 100 ether - escrow, "Buyer should pay exactly the escrowed amount with no refund needed");
    }

    function test_AutoMatchDoesNotPartiallyFillWhenSupplyIsInsufficient() public {
        vm.prank(seller);
        market.postSellOffer(1, 100);

        uint escrow = 15 * 100;
        vm.prank(buyer);
        market.postBuyRequest{value: escrow}(15, 100);

        uint matches = market.autoMatch();
        require(matches == 0, "Insufficient total supply should produce no matches at all");

        (, , uint energyNeeded, , bool active, ) = market.buyRequests(0);
        require(active, "Request should remain fully active");
        require(energyNeeded == 15, "Request should be untouched, not partially filled");

        EnergyMarketplace.SellOffer[] memory offers = market.getActiveOffers();
        require(offers.length == 1, "Sell offer should remain untouched");
        require(offers[0].energy == 1, "Sell offer energy should be unchanged");

        require(seller.balance == 0, "Seller should not be paid when the request isn't fully covered");
        require(buyer.balance == 100 ether - escrow, "Buyer's escrow should remain locked, untouched");
    }

    function test_AutoMatchFillsOnceEnoughSupplyAccumulates() public {
        vm.prank(seller);
        market.postSellOffer(1, 100);

        uint escrow = 15 * 100;
        vm.prank(buyer);
        market.postBuyRequest{value: escrow}(15, 100);

        market.autoMatch();

        address seller3 = makeAddr("seller3");
        vm.prank(seller3);
        market.registerUser("Solar House C");
        vm.prank(seller3);
        market.postSellOffer(14, 100);

        uint matches = market.autoMatch();
        require(matches == 2, "Once supply covers the full request, it should match across both offers");

        EnergyMarketplace.BuyRequest[] memory active = market.getActiveRequests();
        require(active.length == 0, "Request should be fully filled now that supply is sufficient");

        require(seller.balance == 100, "First seller should be paid for its 1 kWh");
        require(seller3.balance == 1400, "Second seller should be paid for its 14 kWh");
        require(buyer.balance == 100 ether - escrow, "Buyer should pay exactly the escrowed amount with no refund needed");
    }

    function test_RenamingDoesNotAlterPastRecords() public {
        vm.prank(seller);
        market.postSellOffer(5, 200);

        uint escrow = 5 * 300;
        vm.prank(buyer);
        market.postBuyRequest{value: escrow}(5, 300);

        market.autoMatch();

        vm.prank(seller);
        market.updateName("Ram");

        (, , , , , , string memory sellerNameAtTrade, ) = market.trades(0);
        require(
            keccak256(bytes(sellerNameAtTrade)) == keccak256(bytes("Solar House A")),
            "Past trade should keep the seller's name as it was at trade time, not the renamed one"
        );

        (, string memory currentName, ) = market.users(seller);
        require(keccak256(bytes(currentName)) == keccak256(bytes("Ram")), "Current registry name should reflect the rename");
    }

    function test_UpdateNameChangesRegisteredName() public {
        vm.prank(seller);
        market.updateName("Ashok");

        (, string memory name, bool registered) = market.users(seller);
        require(keccak256(bytes(name)) == keccak256(bytes("Ashok")), "Name should be updated");
        require(registered, "User should remain registered");
    }

    function test_UpdateNameRevertsIfNotRegistered() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert();
        market.updateName("Nope");
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
