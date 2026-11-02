// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title 燃烧 (Ranshao) BEP-20 project token
contract RanshaoToken is ERC20, Ownable {
    mapping(address => bool) public minters;

    event MinterUpdated(address indexed account, bool allowed);

    modifier onlyMinter() {
        require(minters[msg.sender] || msg.sender == owner(), "token: not minter");
        _;
    }

    constructor(address admin) ERC20("Ranshao", "RS") Ownable(admin) {
        minters[admin] = true;
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        minters[account] = allowed;
        emit MinterUpdated(account, allowed);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
