// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract EnergyTrading {

    struct User {
        address userAddress;
        uint produced;
        uint consumed;
    }

    mapping(address => User) public users;

    function registerUser() public {
        users[msg.sender] = User(msg.sender, 0, 0);
    }

    function updateEnergy(uint _produced, uint _consumed) public {
        users[msg.sender].produced = _produced;
        users[msg.sender].consumed = _consumed;
    }

    function getBalance(address _user) public view returns (int) {
        User memory u = users[_user];
        return int(u.produced) - int(u.consumed);
    }
}